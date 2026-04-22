/**
 * Marketing workflow runner
 *
 * Contract:
 * - pg_cron invokes this function through pg_net on a minute cadence.
 * - the function claims due `campaign_step_runs`, executes exactly one step per claimed row,
 *   then enqueues the next step run if the graph has a successor.
 * - every run is idempotent at the database layer via the claim RPC and step-run uniqueness.
 *
 * Runtime expectations:
 * - `MARKETING_WORKFLOW_RUNNER_SECRET` must match the shared secret stored in Vault and
 *   forwarded by the cron job.
 * - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be present for database access.
 * - outbound SMS/voice uses SignalWire credentials already used by the app.
 * - outbound email uses Resend credentials already used by the app.
 *
 * Local follow-up:
 * - set `MARKETING_WORKFLOW_RUNNER_SECRET`, `MARKETING_EMAIL_REPLY_TO_DOMAIN`, and
 *   `MARKETING_APP_BASE_URL` for realistic end-to-end testing.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.95.1'
import { Resend } from 'npm:resend@6.9.1'
import { RestClient } from 'npm:@signalwire/compatibility-api@3.2.0'

type JsonRecord = Record<string, unknown>

type StepKind = 'sms' | 'email' | 'voicemail' | 'wait' | 'condition' | 'exit'
type StepLane = 'logic' | 'sms' | 'email' | 'voicemail'

type RunnerRequest = {
  batch_size?: number
  dry_run?: boolean
  source?: string
  invoked_at?: string
}

type CampaignStepRow = {
  id: string
  campaign_id: string
  step_order: number
  channel: 'sms' | 'email' | 'voice'
  action_type: string
  content_payload: JsonRecord | null
  template_label: string | null
  voicemail_asset_id: string | null
  review_state: string
  execution_status: string
  node_kind: string | null
  lane_key: string | null
  node_config: JsonRecord | null
  version_id: string | null
}

type CampaignContactRunRow = {
  id: string
  campaign_id: string
  workflow_version_id: string
  campaign_enrollment_id: string
  owner_user_id: string
  property_id: string
  contact_id: string | null
  primary_channel: 'sms' | 'email' | 'voice'
  destination: string
  consent_status: 'granted' | 'denied' | 'unknown'
  consent_source: string
  consent_updated_at: string | null
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'stopped' | 'suppressed'
  current_step_order: number
  last_step_run_id: string | null
  next_due_at: string | null
  launched_at: string | null
  completed_at: string | null
  stopped_at: string | null
  stop_reason: string | null
  execution_context: JsonRecord | null
  created_at: string
  updated_at: string
}

type CampaignWorkflowVersionRow = {
  id: string
  campaign_id: string
  version_number: number
  state: 'draft' | 'snapshot' | 'launched' | 'archived'
  entry_step_id: string | null
  graph_payload: JsonRecord | null
  created_by: string | null
  launched_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

type CampaignStepEdgeRow = {
  id: string
  version_id: string
  from_step_id: string
  to_step_id: string
  branch_key: 'next' | 'true' | 'false'
  sort_order: number
  created_at: string
  updated_at: string
}

type CampaignStepRunRow = {
  id: string
  campaign_id: string
  workflow_version_id: string
  campaign_contact_run_id: string
  campaign_step_id: string
  step_order: number
  node_kind: StepKind
  lane_key: StepLane
  idempotency_key: string
  status: 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'skipped'
  scheduled_for: string
  claimed_at: string | null
  claimed_by: string | null
  started_at: string | null
  completed_at: string | null
  attempt_count: number
  input_payload: JsonRecord | null
  output_payload: JsonRecord | null
  error_message: string | null
  provider_reference: string | null
  next_step_order: number | null
  created_at: string
  updated_at: string
}

type EnrichedStepRun = CampaignStepRunRow & {
  step: CampaignStepRow
  contact_run: CampaignContactRunRow
  workflow_version: CampaignWorkflowVersionRow
}

type StepExecutionResult = {
  status: 'completed' | 'failed' | 'skipped'
  contact_status: CampaignContactRunRow['status']
  output_payload: JsonRecord
  error_message?: string | null
  provider_reference?: string | null
  next_due_at?: string | null
  stop_reason?: string | null
  next_branch?: 'next' | 'true' | 'false' | null
}

type StepGraph = {
  stepsByVersionId: Map<string, CampaignStepRow[]>
  stepsById: Map<string, CampaignStepRow>
  edgesByVersionId: Map<string, CampaignStepEdgeRow[]>
}

const RUNNER_NAME = 'marketing-workflow-runner'
const DEFAULT_BATCH_SIZE = 10
const MAX_BATCH_SIZE = 25

type ChannelDestinationContext = {
  destination: string | null
  consent_status: 'granted' | 'denied' | 'unknown'
  consent_source: string | null
  consent_updated_at: string | null
}

function readEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  return value || null
}

function jsonResponse(body: JsonRecord, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers || {}),
    },
  })
}

function coerceRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as JsonRecord
}

function coerceConsentStatus(value: unknown): ChannelDestinationContext['consent_status'] {
  return value === 'granted' || value === 'denied' ? value : 'unknown'
}

function resolveChannelDestinationContext(
  stepRun: EnrichedStepRun,
  channel: 'sms' | 'email' | 'voice'
): ChannelDestinationContext {
  const executionContext = coerceRecord(stepRun.contact_run.execution_context)
  const destinations = coerceRecord(executionContext?.destinations)
  const channelContext = coerceRecord(destinations?.[channel])

  return {
    destination:
      toText(channelContext?.destination) ||
      (stepRun.contact_run.primary_channel === channel ? stepRun.contact_run.destination : null),
    consent_status:
      channelContext?.consent_status !== undefined
        ? coerceConsentStatus(channelContext.consent_status)
        : stepRun.contact_run.primary_channel === channel
          ? stepRun.contact_run.consent_status
          : 'unknown',
    consent_source:
      toText(channelContext?.consent_source) ||
      (stepRun.contact_run.primary_channel === channel ? stepRun.contact_run.consent_source : null),
    consent_updated_at:
      toText(channelContext?.consent_updated_at) ||
      (stepRun.contact_run.primary_channel === channel ? stepRun.contact_run.consent_updated_at : null),
  }
}

function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePhoneNumber(value: string | null | undefined) {
  const raw = toText(value)
  if (!raw) return null

  let normalized = raw.replace(/[^\d+]/g, '')
  if (!normalized) return null

  if (!normalized.startsWith('+')) {
    if (!/^\d+$/.test(normalized)) return null
    normalized = `+${normalized}`
  }

  return /^\+[1-9]\d{1,14}$/.test(normalized) ? normalized : null
}

function normalizeEmailAddress(value: string | null | undefined) {
  const raw = toText(value).toLowerCase()
  if (!raw) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null
}

function extractEmailAddress(value: string | null | undefined) {
  const raw = toText(value)
  if (!raw) return null

  const match = raw.match(/<([^>]+)>/)
  return normalizeEmailAddress(match ? match[1] : raw)
}

function toPositiveInt(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return fallback
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function stringToBase64Url(value: string) {
  return toBase64Url(new TextEncoder().encode(value))
}

async function signReplyToken(payload: JsonRecord) {
  const body = stringToBase64Url(JSON.stringify(payload))
  const secret =
    readEnv('MARKETING_REPLY_TOKEN_SECRET') ||
    readEnv('MARKETING_WORKFLOW_RUNNER_SECRET') ||
    ''

  if (!secret) {
    return body
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

function mergeNodeConfig(step: CampaignStepRow) {
  return {
    ...(coerceRecord(step.content_payload) || {}),
    ...(coerceRecord(step.node_config) || {}),
  }
}

function inferStepKind(step: CampaignStepRow): StepKind {
  const explicit = toText(step.node_kind).toLowerCase()
  if (
    explicit === 'sms' ||
    explicit === 'email' ||
    explicit === 'voicemail' ||
    explicit === 'wait' ||
    explicit === 'condition' ||
    explicit === 'exit'
  ) {
    return explicit
  }

  const actionType = toText(step.action_type).toLowerCase()
  if (actionType.includes('wait')) return 'wait'
  if (actionType.includes('condition') || actionType.includes('branch')) return 'condition'
  if (actionType.includes('exit') || actionType.includes('stop')) return 'exit'
  if (step.channel === 'email') return 'email'
  if (step.channel === 'voice') return 'voicemail'
  return 'sms'
}

function inferLaneKey(step: CampaignStepRow, kind: StepKind): StepLane {
  const explicit = toText(step.lane_key).toLowerCase()
  if (
    explicit === 'logic' ||
    explicit === 'sms' ||
    explicit === 'email' ||
    explicit === 'voicemail'
  ) {
    return explicit
  }

  if (kind === 'wait' || kind === 'condition' || kind === 'exit') {
    return 'logic'
  }

  if (kind === 'email') return 'email'
  if (kind === 'voicemail') return 'voicemail'
  return 'sms'
}

function getConfigString(config: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function getConfigNumber(config: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function resolvePath(source: unknown, path: string) {
  if (!path) return undefined

  const segments = path.split('.').filter(Boolean)
  let current: unknown = source

  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return undefined
    }

    current = (current as JsonRecord)[segment]
  }

  return current
}

function normalizeComparable(value: unknown) {
  if (typeof value === 'string') {
    return value.trim().toLowerCase()
  }

  return value
}

function compareValues(left: unknown, right: unknown, operator: string) {
  const normalizedLeft = normalizeComparable(left)
  const normalizedRight = normalizeComparable(right)

  switch (operator) {
    case 'equals':
    case 'eq':
    case '==':
      return normalizedLeft === normalizedRight
    case 'not_equals':
    case 'neq':
    case '!=':
      return normalizedLeft !== normalizedRight
    case 'contains':
      return typeof normalizedLeft === 'string' && typeof normalizedRight === 'string'
        ? normalizedLeft.includes(normalizedRight)
        : Array.isArray(normalizedLeft)
          ? normalizedLeft.some((entry) => normalizeComparable(entry) === normalizedRight)
          : false
    case 'not_contains':
      return !compareValues(left, right, 'contains')
    case 'in':
      return Array.isArray(right)
        ? right.some((entry) => normalizeComparable(entry) === normalizedLeft)
        : false
    case 'not_in':
      return !compareValues(left, right, 'in')
    case 'gt':
      return Number(normalizedLeft) > Number(normalizedRight)
    case 'gte':
      return Number(normalizedLeft) >= Number(normalizedRight)
    case 'lt':
      return Number(normalizedLeft) < Number(normalizedRight)
    case 'lte':
      return Number(normalizedLeft) <= Number(normalizedRight)
    case 'exists':
      return left !== undefined && left !== null && `${left}`.trim() !== ''
    case 'missing':
      return left === undefined || left === null || `${left}`.trim() === ''
    case 'truthy':
      return Boolean(left)
    case 'falsy':
      return !Boolean(left)
    default:
      return false
  }
}

function evaluateConditionGroup(config: JsonRecord, context: JsonRecord) {
  const group =
    coerceRecord(config.condition_group) ||
    coerceRecord(config.conditionGroup) ||
    coerceRecord(config.condition) ||
    coerceRecord(config.group) ||
    null

  const rules = Array.isArray(group?.rules)
    ? group?.rules.filter((rule): rule is JsonRecord => Boolean(rule && typeof rule === 'object' && !Array.isArray(rule)))
    : Array.isArray(config.rules)
      ? config.rules.filter((rule): rule is JsonRecord => Boolean(rule && typeof rule === 'object' && !Array.isArray(rule)))
      : []

  const logic = toText(group?.logic || group?.operator || config.logic || config.operator).toLowerCase()
  const mode = logic === 'any' || logic === 'or' ? 'any' : 'all'

  if (!rules.length) {
    return {
      passed: false,
      reason: 'no-rules-configured',
      evaluatedRules: [],
    }
  }

  const evaluatedRules = rules.map((rule) => {
    const field = toText(rule.field || rule.path || rule.key)
    const operator = toText(rule.operator || 'equals').toLowerCase()
    const left = resolvePath(context, field)
    const right =
      rule.values !== undefined
        ? rule.values
        : rule.value !== undefined
          ? rule.value
          : rule.expected !== undefined
            ? rule.expected
            : undefined

    return {
      field,
      operator,
      left,
      right,
      matched: compareValues(left, right, operator),
    }
  })

  const passed = mode === 'any'
    ? evaluatedRules.some((rule) => rule.matched)
    : evaluatedRules.every((rule) => rule.matched)

  return {
    passed,
    reason: null,
    evaluatedRules,
  }
}

function getStepSequence(steps: CampaignStepRow[], currentStepOrder: number) {
  return steps
    .filter((step) => step.step_order > currentStepOrder)
    .sort((left, right) => left.step_order - right.step_order)
}

function buildStepGraph(steps: CampaignStepRow[], edges: CampaignStepEdgeRow[]) {
  const stepsByVersionId = new Map<string, CampaignStepRow[]>()
  const stepsById = new Map<string, CampaignStepRow>()
  const edgesByVersionId = new Map<string, CampaignStepEdgeRow[]>()

  for (const step of steps) {
    stepsById.set(step.id, step)
    const versionId = step.version_id
    if (!versionId) continue

    const existing = stepsByVersionId.get(versionId) || []
    existing.push(step)
    stepsByVersionId.set(versionId, existing)
  }

  for (const versionSteps of stepsByVersionId.values()) {
    versionSteps.sort((left, right) => left.step_order - right.step_order)
  }

  for (const edge of edges) {
    const existing = edgesByVersionId.get(edge.version_id) || []
    existing.push(edge)
    edgesByVersionId.set(edge.version_id, existing)
  }

  for (const versionEdges of edgesByVersionId.values()) {
    versionEdges.sort((left, right) => left.sort_order - right.sort_order)
  }

  return { stepsByVersionId, stepsById, edgesByVersionId } satisfies StepGraph
}

function getNextStepFromGraph(
  graph: StepGraph,
  currentStep: CampaignStepRow,
  workflowVersionId: string,
  branchKey: 'next' | 'true' | 'false' = 'next'
) {
  const steps = graph.stepsByVersionId.get(workflowVersionId) || []
  const edges = graph.edgesByVersionId.get(workflowVersionId) || []

  const explicitEdge = edges.find(
    (edge) => edge.from_step_id === currentStep.id && edge.branch_key === branchKey
  )
  if (explicitEdge) {
    const edgeStep = graph.stepsById.get(explicitEdge.to_step_id)
    if (edgeStep && edgeStep.step_order > currentStep.step_order) {
      return { step: edgeStep, branchKey }
    }
    return {
      step: null,
      branchKey,
      error: 'workflow edge points backward or to an unknown step',
    }
  }

  const fallback = getStepSequence(steps, currentStep.step_order)[0] || null
  return { step: fallback, branchKey }
}

function getWaitDurationMs(config: JsonRecord) {
  const explicitMs = getConfigNumber(config, 'delay_ms', 'wait_ms', 'waitMs', 'duration_ms')
  if (explicitMs !== null) return Math.max(0, Math.floor(explicitMs))

  const seconds = getConfigNumber(config, 'delay_seconds', 'wait_seconds', 'waitSeconds', 'seconds')
  if (seconds !== null) return Math.max(0, Math.floor(seconds * 1000))

  const minutes = getConfigNumber(config, 'delay_minutes', 'wait_minutes', 'waitMinutes', 'minutes')
  if (minutes !== null) return Math.max(0, Math.floor(minutes * 60 * 1000))

  const hours = getConfigNumber(config, 'delay_hours', 'wait_hours', 'waitHours', 'hours')
  if (hours !== null) return Math.max(0, Math.floor(hours * 60 * 60 * 1000))

  return 0
}

function isActiveSuppression(row: JsonRecord | null) {
  if (!row) return false

  const status = toText(row.status).toLowerCase()
  const resolvedAt = toText(row.resolved_at)
  return status !== 'resolved' && !resolvedAt
}

async function createSupabaseClient() {
  const url = readEnv('SUPABASE_URL') || readEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the marketing runner.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function getRunnerSecret() {
  return readEnv('MARKETING_WORKFLOW_RUNNER_SECRET')
}

function assertRunnerSecret(req: Request) {
  const expected = getRunnerSecret()
  if (!expected) {
    throw new Error('MARKETING_WORKFLOW_RUNNER_SECRET is not configured.')
  }

  const provided =
    req.headers.get('x-marketing-runner-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    ''

  if (provided !== expected) {
    const error = new Error('Unauthorized')
    ;(error as Error & { status?: number }).status = 401
    throw error
  }
}

function getResendClient() {
  const apiKey = readEnv('RESEND_API_KEY')
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.')
  }

  return new Resend(apiKey)
}

function getSignalWireClient() {
  const projectId = readEnv('SIGNALWIRE_PROJECT_ID')
  const apiToken = readEnv('SIGNALWIRE_API_TOKEN')
  const spaceUrl = readEnv('SIGNALWIRE_SPACE_URL')

  if (!projectId || !apiToken || !spaceUrl) {
    throw new Error('SignalWire credentials are not configured.')
  }

  return RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl })
}

function getMarketingAppBaseUrl() {
  return readEnv('MARKETING_APP_BASE_URL') || readEnv('APP_BASE_URL') || null
}

async function checkSuppression(params: {
  supabase: SupabaseClient
  ownerUserId: string
  channel: 'sms' | 'email' | 'voice'
  destination: string
}) {
  const { data, error } = await params.supabase
    .from('global_suppressions')
    .select('id, owner_user_id, channel, destination, status, resolved_at, reason, source')
    .eq('owner_user_id', params.ownerUserId)
    .eq('channel', params.channel)
    .eq('destination', params.destination)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!isActiveSuppression(data as JsonRecord | null)) {
    return { allowed: true, row: null as JsonRecord | null }
  }

  return { allowed: false, row: data as JsonRecord }
}

function buildExecutionContext(
  stepRun: EnrichedStepRun,
  graph: StepGraph
): JsonRecord {
  const stepConfig = mergeNodeConfig(stepRun.step)
  const baseContext = coerceRecord(stepRun.contact_run.execution_context) || {}
  const workflowSteps = graph.stepsByVersionId.get(stepRun.workflow_version_id) || []

  return {
    ...baseContext,
    workflow: {
      id: stepRun.workflow_version.id,
      campaign_id: stepRun.workflow_version.campaign_id,
      version_number: stepRun.workflow_version.version_number,
      state: stepRun.workflow_version.state,
      entry_step_id: stepRun.workflow_version.entry_step_id,
    },
    step: {
      id: stepRun.step.id,
      step_order: stepRun.step.step_order,
      node_kind: stepRun.step.node_kind,
      lane_key: stepRun.step.lane_key,
      channel: stepRun.step.channel,
      action_type: stepRun.step.action_type,
      node_config: stepConfig,
    },
    contact_run: {
      id: stepRun.contact_run.id,
      campaign_id: stepRun.contact_run.campaign_id,
      workflow_version_id: stepRun.contact_run.workflow_version_id,
      campaign_enrollment_id: stepRun.contact_run.campaign_enrollment_id,
      owner_user_id: stepRun.contact_run.owner_user_id,
      property_id: stepRun.contact_run.property_id,
      contact_id: stepRun.contact_run.contact_id,
      primary_channel: stepRun.contact_run.primary_channel,
      destination: stepRun.contact_run.destination,
      consent_status: stepRun.contact_run.consent_status,
      consent_source: stepRun.contact_run.consent_source,
      status: stepRun.contact_run.status,
      current_step_order: stepRun.contact_run.current_step_order,
      launched_at: stepRun.contact_run.launched_at,
      execution_context: baseContext,
    },
    launch: baseContext.launch || baseContext.launch_snapshot || null,
    graph_summary: {
      step_count: workflowSteps.length,
      entry_step_id: stepRun.workflow_version.entry_step_id,
    },
  }
}

async function claimDueStepRuns(supabase: SupabaseClient, batchSize: number) {
  const { data, error } = await supabase.rpc('claim_due_campaign_step_runs', {
    p_limit: batchSize,
  })

  if (error) {
    throw error
  }

  return (data || []) as CampaignStepRunRow[]
}

async function loadCampaignStepRowsByVersionIds(
  supabase: SupabaseClient,
  versionIds: string[]
) {
  if (!versionIds.length) return [] as CampaignStepRow[]

  const { data, error } = await supabase
    .from('campaign_steps')
    .select(
      'id, campaign_id, step_order, channel, action_type, content_payload, template_label, voicemail_asset_id, review_state, execution_status, node_kind, lane_key, node_config, version_id'
    )
    .in('version_id', versionIds)

  if (error) {
    throw error
  }

  return (data || []) as CampaignStepRow[]
}

async function loadCampaignContactRuns(supabase: SupabaseClient, runIds: string[]) {
  if (!runIds.length) return [] as CampaignContactRunRow[]

  const { data, error } = await supabase
    .from('campaign_contact_runs')
    .select(
      'id, campaign_id, workflow_version_id, campaign_enrollment_id, owner_user_id, property_id, contact_id, primary_channel, destination, consent_status, consent_source, consent_updated_at, status, current_step_order, last_step_run_id, next_due_at, launched_at, completed_at, stopped_at, stop_reason, execution_context, created_at, updated_at'
    )
    .in('id', runIds)

  if (error) {
    throw error
  }

  return (data || []) as CampaignContactRunRow[]
}

async function loadCampaignWorkflowVersions(supabase: SupabaseClient, versionIds: string[]) {
  if (!versionIds.length) return [] as CampaignWorkflowVersionRow[]

  const { data, error } = await supabase
    .from('campaign_workflow_versions')
    .select(
      'id, campaign_id, version_number, state, entry_step_id, graph_payload, created_by, launched_at, archived_at, created_at, updated_at'
    )
    .in('id', versionIds)

  if (error) {
    throw error
  }

  return (data || []) as CampaignWorkflowVersionRow[]
}

async function loadCampaignStepEdges(supabase: SupabaseClient, versionIds: string[]) {
  if (!versionIds.length) return [] as CampaignStepEdgeRow[]

  const { data, error } = await supabase
    .from('campaign_step_edges')
    .select('id, version_id, from_step_id, to_step_id, branch_key, sort_order, created_at, updated_at')
    .in('version_id', versionIds)

  if (error) {
    throw error
  }

  return (data || []) as CampaignStepEdgeRow[]
}

function buildEnrichedRuns(
  claimedRuns: CampaignStepRunRow[],
  stepRows: CampaignStepRow[],
  contactRuns: CampaignContactRunRow[],
  workflowVersions: CampaignWorkflowVersionRow[]
) {
  const stepsById = new Map(stepRows.map((step) => [step.id, step]))
  const contactRunsById = new Map(contactRuns.map((run) => [run.id, run]))
  const versionsById = new Map(workflowVersions.map((version) => [version.id, version]))

  return claimedRuns
    .map((run) => {
      const step = stepsById.get(run.campaign_step_id)
      const contactRun = contactRunsById.get(run.campaign_contact_run_id)
      const workflowVersion = versionsById.get(run.workflow_version_id)

      if (!step || !contactRun || !workflowVersion) {
        return null
      }

      const kind = inferStepKind(step)
      const laneKey = inferLaneKey(step, kind)
      return {
        ...run,
        node_kind: kind,
        lane_key: laneKey,
        step,
        contact_run: contactRun,
        workflow_version: workflowVersion,
      } satisfies EnrichedStepRun
    })
    .filter((run): run is EnrichedStepRun => Boolean(run))
}

async function persistStepRunOutcome(
  supabase: SupabaseClient,
  stepRun: EnrichedStepRun,
  result: StepExecutionResult
) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('campaign_step_runs')
    .update({
      status: result.status,
      completed_at: now,
      provider_reference: result.provider_reference || null,
      error_message: result.error_message || null,
      output_payload: {
        ...(coerceRecord(stepRun.output_payload) || {}),
        ...result.output_payload,
      },
      next_step_order: result.next_branch ? stepRun.next_step_order : stepRun.next_step_order,
      updated_at: now,
    })
    .eq('id', stepRun.id)

  if (error) {
    throw error
  }
}

async function persistContactRunState(
  supabase: SupabaseClient,
  stepRun: EnrichedStepRun,
  result: StepExecutionResult,
  nextStepOrder: number | null,
  nextDueAt: string | null
) {
  const now = new Date().toISOString()
  const updatePayload: JsonRecord = {
    current_step_order: nextStepOrder || stepRun.step.step_order,
    last_step_run_id: stepRun.id,
    next_due_at: nextDueAt,
    updated_at: now,
  }

  if (result.contact_status === 'completed') {
    updatePayload.status = 'completed'
    updatePayload.completed_at = now
    updatePayload.next_due_at = null
  } else if (result.contact_status === 'failed') {
    updatePayload.status = 'failed'
    updatePayload.completed_at = null
  } else if (result.contact_status === 'suppressed') {
    updatePayload.status = 'suppressed'
    updatePayload.stopped_at = now
    updatePayload.stop_reason = result.stop_reason || 'suppressed'
    updatePayload.next_due_at = null
  } else if (result.contact_status === 'waiting') {
    updatePayload.status = 'waiting'
  } else {
    updatePayload.status = 'running'
  }

  const { error } = await supabase
    .from('campaign_contact_runs')
    .update(updatePayload)
    .eq('id', stepRun.contact_run.id)

  if (error) {
    throw error
  }
}

async function enqueueNextStepRun(
  supabase: SupabaseClient,
  stepRun: EnrichedStepRun,
  nextStep: CampaignStepRow,
  scheduledFor: string,
  inputPayload: JsonRecord,
  outputPayload: JsonRecord,
  providerReference: string | null
) {
  const idempotencyKey = [
    stepRun.contact_run.id,
    nextStep.step_order,
    nextStep.id,
  ].join(':')

  const { data, error } = await supabase.rpc('enqueue_campaign_step_run', {
    p_campaign_id: stepRun.campaign_id,
    p_workflow_version_id: stepRun.workflow_version_id,
    p_campaign_contact_run_id: stepRun.campaign_contact_run_id,
    p_campaign_step_id: nextStep.id,
    p_step_order: nextStep.step_order,
    p_node_kind: inferStepKind(nextStep),
    p_lane_key: inferLaneKey(nextStep, inferStepKind(nextStep)),
    p_scheduled_for: scheduledFor,
    p_idempotency_key: idempotencyKey,
    p_input_payload: inputPayload,
    p_output_payload: outputPayload,
    p_status: 'queued',
    p_provider_reference: providerReference,
    p_next_step_order: null,
  })

  if (error) {
    throw error
  }

  return data as CampaignStepRunRow
}

async function sendSmsStep(
  supabase: SupabaseClient,
  stepRun: EnrichedStepRun,
  config: JsonRecord,
  dryRun: boolean
): Promise<StepExecutionResult> {
  const channelContext = resolveChannelDestinationContext(stepRun, 'sms')
  const destination = normalizePhoneNumber(channelContext.destination)
  if (!destination) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'Missing or invalid SMS destination.',
      output_payload: { blocked_reason: 'missing_destination' },
    }
  }

  if (channelContext.consent_status !== 'granted') {
    return {
      status: 'failed',
      contact_status: channelContext.consent_status === 'denied' ? 'suppressed' : 'failed',
      stop_reason:
        channelContext.consent_status === 'denied' ? 'consent_denied' : 'missing_consent',
      error_message:
        channelContext.consent_status === 'denied'
          ? 'SMS destination consent is denied.'
          : 'SMS destination consent is missing.',
      output_payload: {
        blocked_reason:
          channelContext.consent_status === 'denied' ? 'consent_denied' : 'missing_consent',
      },
    }
  }

  const suppression = await checkSuppression({
    supabase,
    ownerUserId: stepRun.contact_run.owner_user_id,
    channel: 'sms',
    destination,
  })

  if (!suppression.allowed) {
    return {
      status: 'failed',
      contact_status: 'suppressed',
      stop_reason: 'suppressed',
      error_message: 'SMS destination is globally suppressed.',
      output_payload: {
        blocked_reason: 'suppressed',
        suppression: suppression.row,
      },
    }
  }

  const body =
    getConfigString(config, 'body', 'message', 'text', 'content') ||
    getConfigString(stepRun.step.content_payload || {}, 'body', 'message', 'text', 'content') ||
    ''

  if (!body) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'SMS step is missing body content.',
      output_payload: { blocked_reason: 'missing_body' },
    }
  }

  const fromNumber =
    normalizePhoneNumber(
      getConfigString(config, 'from_number', 'fromNumber', 'from') ||
        readEnv('SIGNALWIRE_PHONE_NUMBER')
    ) || null

  if (!fromNumber && !dryRun) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'SMS sender number is not configured.',
      output_payload: { blocked_reason: 'missing_sender' },
    }
  }

  if (dryRun) {
    return {
      status: 'completed',
      contact_status: 'running',
      provider_reference: `dry-run-sms:${stepRun.id}`,
      output_payload: {
        provider: 'signalwire',
        dry_run: true,
        destination,
        from_number: fromNumber,
        body,
      },
    }
  }

  const statusCallbackBase = getMarketingAppBaseUrl()
  const statusCallback = statusCallbackBase
    ? `${statusCallbackBase.replace(/\/+$/, '')}/api/sms/status`
    : null

  const result = await getSignalWireClient().messages.create({
    body,
    from: fromNumber,
    to: destination,
    ...(statusCallback ? { statusCallback } : {}),
  } as never)

  return {
    status: 'completed',
    contact_status: 'running',
    provider_reference: toText(result?.sid) || toText(result?.messageSid) || null,
    output_payload: {
      provider: 'signalwire',
      destination,
      from_number: fromNumber,
      body,
      provider_response: result,
    },
  }
}

async function buildEmailReplyTo(stepRun: EnrichedStepRun) {
  const replyDomain =
    readEnv('MARKETING_EMAIL_REPLY_TO_DOMAIN') ||
    readEnv('RESEND_DOMAIN') ||
    null

  if (!replyDomain) {
    return { address: null, token: null }
  }

  const emailContext = resolveChannelDestinationContext(stepRun, 'email')

  const token = await signReplyToken({
    campaign_id: stepRun.campaign_id,
    workflow_version_id: stepRun.workflow_version_id,
    contact_run_id: stepRun.campaign_contact_run_id,
    step_run_id: stepRun.id,
    step_order: stepRun.step_order,
    destination: emailContext.destination || stepRun.contact_run.destination,
  })

  const localPart = readEnv('MARKETING_EMAIL_REPLY_TO_LOCAL_PART') || 'reply'
  return {
    address: `${localPart}+${token}@${replyDomain.replace(/^mailto:/i, '').replace(/^https?:\/\//i, '')}`,
    token,
  }
}

async function sendEmailStep(
  _supabase: SupabaseClient,
  stepRun: EnrichedStepRun,
  config: JsonRecord,
  dryRun: boolean
): Promise<StepExecutionResult> {
  const channelContext = resolveChannelDestinationContext(stepRun, 'email')
  const destination = normalizeEmailAddress(channelContext.destination)
  if (!destination) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'Missing or invalid email destination.',
      output_payload: { blocked_reason: 'missing_destination' },
    }
  }

  if (channelContext.consent_status !== 'granted') {
    return {
      status: 'failed',
      contact_status: channelContext.consent_status === 'denied' ? 'suppressed' : 'failed',
      stop_reason:
        channelContext.consent_status === 'denied' ? 'consent_denied' : 'missing_consent',
      error_message:
        channelContext.consent_status === 'denied'
          ? 'Email destination consent is denied.'
          : 'Email destination consent is missing.',
      output_payload: {
        blocked_reason:
          channelContext.consent_status === 'denied' ? 'consent_denied' : 'missing_consent',
      },
    }
  }

  const body = getConfigString(config, 'html', 'body', 'message', 'text', 'content') || ''
  const subject = getConfigString(config, 'subject', 'title') || 'Campaign update'

  if (!body) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'Email step is missing body content.',
      output_payload: { blocked_reason: 'missing_body' },
    }
  }

  const replyTo = await buildEmailReplyTo(stepRun)
  const fromHeader =
    getConfigString(config, 'from', 'from_address', 'fromAddress') ||
    readEnv('MARKETING_EMAIL_FROM_ADDRESS') ||
    `NextGen Realty <noreply@${readEnv('RESEND_DOMAIN') || 'onboarding.resend.dev'}>`
  const fromAddress = extractEmailAddress(fromHeader)

  if (!fromAddress && !dryRun) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'Email sender address is not configured.',
      output_payload: { blocked_reason: 'missing_sender' },
    }
  }

  if (dryRun) {
    return {
      status: 'completed',
      contact_status: 'running',
      provider_reference: `dry-run-email:${stepRun.id}`,
      output_payload: {
        provider: 'resend',
        dry_run: true,
        destination,
        from: fromHeader,
        subject,
        body,
        reply_to: replyTo.address,
      },
    }
  }

  const resend = getResendClient()
  const sent = await resend.emails.send({
    from: fromHeader,
    to: destination,
    subject,
    html: body,
    ...(replyTo.address ? { replyTo: replyTo.address } : {}),
    tags: [
      { name: 'campaign_id', value: stepRun.campaign_id },
      { name: 'workflow_version_id', value: stepRun.workflow_version_id },
      { name: 'contact_run_id', value: stepRun.campaign_contact_run_id },
      { name: 'step_run_id', value: stepRun.id },
    ],
  })

  if (sent.error) {
    throw new Error(
      typeof sent.error === 'object' && sent.error && 'message' in sent.error
        ? String((sent.error as { message?: unknown }).message || 'Failed to send email.')
        : 'Failed to send email.'
    )
  }

  const providerReference = toText(sent.data?.id) || toText(sent.data?.emailId) || null

  return {
    status: 'completed',
    contact_status: 'running',
    provider_reference: providerReference,
    output_payload: {
      provider: 'resend',
      destination,
      from: fromHeader,
      subject,
      body,
      reply_to: replyTo.address,
      reply_to_token: replyTo.token,
      provider_response: sent.data,
    },
  }
}

async function sendVoicemailStep(
  supabase: SupabaseClient,
  stepRun: EnrichedStepRun,
  config: JsonRecord,
  dryRun: boolean
): Promise<StepExecutionResult> {
  const channelContext = resolveChannelDestinationContext(stepRun, 'voice')
  const destination = normalizePhoneNumber(channelContext.destination)
  if (!destination) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'Missing or invalid voice destination.',
      output_payload: { blocked_reason: 'missing_destination' },
    }
  }

  const voicemailUrl =
    getConfigString(config, 'voicemail_url', 'voicemailUrl', 'asset_url', 'assetUrl') ||
    null
  if (!voicemailUrl) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'Voice step is missing a voicemail asset URL.',
      output_payload: { blocked_reason: 'missing_voicemail_url' },
    }
  }

  const suppression = await checkSuppression({
    supabase,
    ownerUserId: stepRun.contact_run.owner_user_id,
    channel: 'voice',
    destination,
  })

  if (!suppression.allowed) {
    return {
      status: 'failed',
      contact_status: 'suppressed',
      stop_reason: 'suppressed',
      error_message: 'Voice destination is globally suppressed.',
      output_payload: {
        blocked_reason: 'suppressed',
        suppression: suppression.row,
      },
    }
  }

  const appBaseUrl = getMarketingAppBaseUrl()
  if (!appBaseUrl && !dryRun) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'MARKETING_APP_BASE_URL is required for marketing voice calls.',
      output_payload: { blocked_reason: 'missing_app_base_url' },
    }
  }

  const fromNumber =
    normalizePhoneNumber(
      getConfigString(config, 'from_number', 'fromNumber', 'from') ||
        readEnv('SIGNALWIRE_PHONE_NUMBER')
    ) || null

  if (!fromNumber && !dryRun) {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'Voice sender number is not configured.',
      output_payload: { blocked_reason: 'missing_sender' },
    }
  }

  const outboundUrl = appBaseUrl
    ? new URL('/api/voice/outbound', appBaseUrl)
    : null
  if (outboundUrl) {
    outboundUrl.searchParams.set('Mode', 'voicemail')
    outboundUrl.searchParams.set('VoicemailUrl', voicemailUrl)
    outboundUrl.searchParams.set('CampaignId', stepRun.campaign_id)
    outboundUrl.searchParams.set('WorkflowVersionId', stepRun.workflow_version_id)
    outboundUrl.searchParams.set('ContactRunId', stepRun.campaign_contact_run_id)
    outboundUrl.searchParams.set('StepRunId', stepRun.id)
  }

  const statusCallback = appBaseUrl
    ? new URL('/api/voice/webhook', appBaseUrl)
    : null
  if (statusCallback) {
    statusCallback.searchParams.set('CampaignId', stepRun.campaign_id)
    statusCallback.searchParams.set('WorkflowVersionId', stepRun.workflow_version_id)
    statusCallback.searchParams.set('ContactRunId', stepRun.campaign_contact_run_id)
    statusCallback.searchParams.set('StepRunId', stepRun.id)
    statusCallback.searchParams.set('Mode', 'voicemail')
  }

  if (dryRun) {
    return {
      status: 'completed',
      contact_status: 'running',
      provider_reference: `dry-run-voice:${stepRun.id}`,
      output_payload: {
        provider: 'signalwire',
        dry_run: true,
        destination,
        from_number: fromNumber,
        voicemail_url: voicemailUrl,
        outbound_url: outboundUrl?.toString() || null,
        status_callback: statusCallback?.toString() || null,
        machine_detection: 'DetectMessageEnd',
      },
    }
  }

  const result = await getSignalWireClient().calls.create({
    from: fromNumber,
    to: destination,
    url: outboundUrl?.toString(),
    statusCallback: statusCallback?.toString(),
    machineDetection: 'DetectMessageEnd',
  } as never)

  return {
    status: 'completed',
    contact_status: 'running',
    provider_reference: toText(result?.sid) || toText(result?.callSid) || null,
    output_payload: {
      provider: 'signalwire',
      destination,
      from_number: fromNumber,
      voicemail_url: voicemailUrl,
      outbound_url: outboundUrl?.toString() || null,
      status_callback: statusCallback?.toString() || null,
      provider_response: result,
      machine_detection: 'DetectMessageEnd',
    },
  }
}

async function runWaitStep(
  stepRun: EnrichedStepRun,
  config: JsonRecord
): Promise<StepExecutionResult> {
  const delayMs = getWaitDurationMs(config)
  const nextDueAt = new Date(Date.now() + delayMs).toISOString()

  return {
    status: 'completed',
    contact_status: delayMs > 0 ? 'waiting' : 'running',
    next_due_at: nextDueAt,
    output_payload: {
      wait_ms: delayMs,
      next_due_at: nextDueAt,
      step_order: stepRun.step.step_order,
    },
  }
}

async function runConditionStep(
  stepRun: EnrichedStepRun,
  config: JsonRecord,
  context: JsonRecord
): Promise<StepExecutionResult> {
  const evaluation = evaluateConditionGroup(config, context)

  if (evaluation.reason === 'no-rules-configured') {
    return {
      status: 'failed',
      contact_status: 'failed',
      error_message: 'Condition step has no rules configured.',
      output_payload: {
        blocked_reason: 'missing_condition_rules',
      },
    }
  }

  return {
    status: 'completed',
    contact_status: 'running',
    output_payload: {
      passed: evaluation.passed,
      evaluated_rules: evaluation.evaluatedRules,
      branch_key: evaluation.passed ? 'true' : 'false',
      step_order: stepRun.step.step_order,
    },
    next_branch: evaluation.passed ? 'true' : 'false',
  }
}

async function runExitStep(stepRun: EnrichedStepRun): Promise<StepExecutionResult> {
  return {
    status: 'completed',
    contact_status: 'completed',
    output_payload: {
      terminal: true,
      step_order: stepRun.step.step_order,
    },
  }
}

async function executeStepRun(
  supabase: SupabaseClient,
  graph: StepGraph,
  stepRun: EnrichedStepRun,
  dryRun: boolean
) {
  const now = new Date().toISOString()
  const startUpdate = await supabase
    .from('campaign_step_runs')
    .update({
      status: 'running',
      started_at: now,
      updated_at: now,
    })
    .eq('id', stepRun.id)
    .eq('status', 'claimed')

  if (startUpdate.error) {
    throw startUpdate.error
  }

  const config = mergeNodeConfig(stepRun.step)
  const executionContext = buildExecutionContext(stepRun, graph)
  const kind = inferStepKind(stepRun.step)

  let result: StepExecutionResult
  if (kind === 'sms') {
    result = await sendSmsStep(supabase, stepRun, config, dryRun)
  } else if (kind === 'email') {
    result = await sendEmailStep(supabase, stepRun, config, dryRun)
  } else if (kind === 'voicemail') {
    result = await sendVoicemailStep(supabase, stepRun, config, dryRun)
  } else if (kind === 'wait') {
    result = await runWaitStep(stepRun, config)
  } else if (kind === 'condition') {
    result = await runConditionStep(stepRun, config, executionContext)
  } else {
    result = await runExitStep(stepRun)
  }

  const nextStepRef = result.next_branch
    ? getNextStepFromGraph(graph, stepRun.step, stepRun.workflow_version_id, result.next_branch)
    : getNextStepFromGraph(graph, stepRun.step, stepRun.workflow_version_id, 'next')

  if (nextStepRef.error) {
    result = {
      status: 'failed',
      contact_status: 'failed',
      error_message: nextStepRef.error,
      output_payload: {
        ...result.output_payload,
        blocked_reason: 'invalid_edge',
        error: nextStepRef.error,
      },
    }
  }

  await persistStepRunOutcome(supabase, stepRun, result)

  const nextStep = nextStepRef.step
  const nextDueAt = result.next_due_at || (kind === 'wait' ? new Date(Date.now() + getWaitDurationMs(config)).toISOString() : now)
  const shouldScheduleNext =
    Boolean(nextStep) &&
    result.status === 'completed' &&
    result.contact_status !== 'completed' &&
    result.contact_status !== 'failed' &&
    result.contact_status !== 'suppressed'

  if (shouldScheduleNext && nextStep) {
    const scheduledFor = kind === 'wait' ? nextDueAt : now
    const nextInputPayload = {
      step_order: nextStep.step_order,
      source_step_run_id: stepRun.id,
      branch_key: result.next_branch || 'next',
      inherited_context: executionContext,
    }
    const nextOutputPayload = {
      inherited_from_step_run_id: stepRun.id,
      branch_key: result.next_branch || 'next',
    }
    const nextRun = await enqueueNextStepRun(
      supabase,
      stepRun,
      nextStep,
      scheduledFor,
      nextInputPayload,
      nextOutputPayload,
      result.provider_reference || null
    )

    await persistContactRunState(
      supabase,
      stepRun,
      result,
      nextStep.step_order,
      scheduledFor
    )

    return {
      step_run_id: stepRun.id,
      contact_run_id: stepRun.campaign_contact_run_id,
      step_order: stepRun.step_order,
      kind,
      status: result.status,
      next_step_run_id: nextRun.id,
      next_step_order: nextStep.step_order,
      provider_reference: result.provider_reference || null,
      output_payload: result.output_payload,
    }
  }

  await persistContactRunState(supabase, stepRun, result, null, null)

  return {
    step_run_id: stepRun.id,
    contact_run_id: stepRun.campaign_contact_run_id,
    step_order: stepRun.step_order,
    kind,
    status: result.status,
    next_step_run_id: null,
    next_step_order: null,
    provider_reference: result.provider_reference || null,
    output_payload: result.output_payload,
  }
}

async function handleInvocation(req: Request) {
  assertRunnerSecret(req)

  const body = (await req.json().catch(() => ({}))) as RunnerRequest
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    toPositiveInt(body.batch_size, DEFAULT_BATCH_SIZE)
  )
  const dryRun = Boolean(body.dry_run)

  const supabase = await createSupabaseClient()
  const claimedRuns = await claimDueStepRuns(supabase, batchSize)

  if (!claimedRuns.length) {
    return jsonResponse({
      ok: true,
      claimed: 0,
      processed: 0,
      dry_run: dryRun,
      source: body.source || 'manual',
      message: 'No due step runs were available.',
    })
  }

  const versionIds = Array.from(new Set(claimedRuns.map((run) => run.workflow_version_id)))
  const stepRows = await loadCampaignStepRowsByVersionIds(supabase, versionIds)
  const contactRuns = await loadCampaignContactRuns(
    supabase,
    claimedRuns.map((run) => run.campaign_contact_run_id)
  )
  const workflowVersions = await loadCampaignWorkflowVersions(supabase, versionIds)
  const edges = await loadCampaignStepEdges(supabase, versionIds)

  const graph = buildStepGraph(stepRows, edges)
  const enrichedRuns = buildEnrichedRuns(claimedRuns, stepRows, contactRuns, workflowVersions)

  const results: JsonRecord[] = []
  for (const stepRun of enrichedRuns) {
    try {
      const result = await executeStepRun(supabase, graph, stepRun, dryRun)
      results.push({
        ok: true,
        ...result,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown runner error.'

      await supabase
        .from('campaign_step_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: message,
          updated_at: new Date().toISOString(),
          output_payload: {
            runner_error: message,
          },
        })
        .eq('id', stepRun.id)

      await supabase
        .from('campaign_contact_runs')
        .update({
          status: 'failed',
          stop_reason: 'runner_error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', stepRun.campaign_contact_run_id)

      results.push({
        ok: false,
        step_run_id: stepRun.id,
        contact_run_id: stepRun.campaign_contact_run_id,
        error: message,
      })
    }
  }

  return jsonResponse({
    ok: true,
    claimed: claimedRuns.length,
    processed: results.length,
    dry_run: dryRun,
    source: body.source || 'manual',
    results,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization, x-marketing-runner-secret',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      },
    })
  }

  try {
    if (req.method === 'GET') {
      assertRunnerSecret(req)
      return jsonResponse({
        ok: true,
        runner: RUNNER_NAME,
        configured: {
          supabase: Boolean(readEnv('SUPABASE_URL') && readEnv('SUPABASE_SERVICE_ROLE_KEY')),
          runner_secret: Boolean(getRunnerSecret()),
          signalwire: Boolean(
            readEnv('SIGNALWIRE_PROJECT_ID') &&
              readEnv('SIGNALWIRE_API_TOKEN') &&
              readEnv('SIGNALWIRE_SPACE_URL')
          ),
          resend: Boolean(readEnv('RESEND_API_KEY')),
          app_base_url: Boolean(getMarketingAppBaseUrl()),
        },
      })
    }

    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    return await handleInvocation(req)
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500
    const message = error instanceof Error ? error.message : 'Unknown runner failure.'

    return jsonResponse(
      {
        ok: false,
        runner: RUNNER_NAME,
        error: message,
      },
      { status }
    )
  }
})
