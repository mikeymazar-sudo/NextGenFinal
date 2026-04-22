'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { formatDistanceToNow } from 'date-fns'
import {
  Clock3,
  CopyPlus,
  GitBranch,
  GripVertical,
  Layers3,
  Mail,
  MessageSquareMore,
  MicVocal,
  Plus,
  Trash2,
  Wand2,
  Workflow,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type WorkflowNodeKind = 'sms' | 'email' | 'voicemail' | 'wait' | 'condition' | 'exit'
type WorkflowLaneKey = 'logic' | 'sms' | 'email' | 'voicemail'
type WorkflowEdgeKind = 'next' | 'true' | 'false'
type ConditionOperator = 'and' | 'or'
type WaitUnit = 'minutes' | 'hours' | 'days'
type RuleComparator = 'equals' | 'contains' | 'exists' | 'is_granted' | 'is_denied'

type ConditionRule = {
  id: string
  field: string
  comparator: RuleComparator
  value: string
}

type WorkflowNodeConfig = {
  subject?: string
  message?: string
  voicemailAssetLabel?: string
  waitAmount?: number
  waitUnit?: WaitUnit
  operator?: ConditionOperator
  rules?: ConditionRule[]
  trueTargetId?: string | null
  falseTargetId?: string | null
  exitReason?: string
}

type WorkflowNode = {
  id: string
  kind: WorkflowNodeKind
  laneKey: WorkflowLaneKey
  sequence: number
  title: string
  summary: string
  config: WorkflowNodeConfig
  legacy?: boolean
  locked?: boolean
}

type WorkflowEdge = {
  id: string
  from: string
  to: string
  kind: WorkflowEdgeKind
  label?: string
}

type WorkflowVersionSummary = {
  id: string
  label: string
  status: 'draft' | 'launched' | 'archived'
  createdAt: string
  launchedAt: string | null
  immutable: boolean
  description: string
  nodeCount: number
  edgeCount: number
}

type ConsentBucket = {
  granted: number
  denied: number
  unknown: number
  missing_consent: number
  suppressed: number
}

type ConsentSummary = {
  sms: ConsentBucket
  email: ConsentBucket
  voice: ConsentBucket
}

export type WorkflowCampaignRecord = {
  id: string
  name: string
  channel?: string
  launchState?: string
  reviewState?: string
  eligibleCount?: number
  suppressedCount?: number
  ineligibleCount?: number
  launchedAt?: string | null
  lastReviewAt?: string | null
  steps?: Array<Record<string, unknown>>
  draft?: Record<string, unknown> | null
  workflow?: unknown
  workflowVersion?: unknown
  workflowVersions?: unknown
  convertedLegacyFlow?: boolean
  readOnlyWorkflow?: boolean
  consentSummary?: unknown
  [key: string]: unknown
}

type WorkflowSnapshot = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  versions: WorkflowVersionSummary[]
  selectedNodeId: string | null
  sourceLabel: string
  mode: 'draft' | 'legacy-converted' | 'read-only'
  savedAt: string
}

type MarketingWorkflowBuilderProps = {
  campaigns: WorkflowCampaignRecord[]
  selectedCampaignId: string | null
  onSelectCampaign: (campaignId: string) => void
  onSaveWorkflow?: (payload: {
    campaignId: string
    nodes: Array<{
      id: string
      kind: WorkflowNodeKind
      laneKey: WorkflowLaneKey
      sequence: number
      label: string
      position: { x: number; y: number }
      config: Record<string, unknown>
    }>
    edges: Array<{
      id: string
      sourceNodeId: string
      targetNodeId: string
      branchKey: 'default' | 'true' | 'false'
    }>
  }) => Promise<void> | void
}

type PaletteItem = {
  kind: WorkflowNodeKind
  label: string
  laneKey: WorkflowLaneKey
  helper: string
  summary: string
  icon: typeof Workflow
  accent: string
}

const laneMeta: Record<
  WorkflowLaneKey,
  { label: string; helper: string; accent: string; icon: typeof Layers3 }
> = {
  logic: {
    label: 'Logic',
    helper: 'Waits, conditions, and exits keep the run honest.',
    accent: 'from-zinc-100 via-white to-zinc-50 dark:from-zinc-900/80 dark:via-zinc-950 dark:to-zinc-900/60',
    icon: Layers3,
  },
  sms: {
    label: 'SMS',
    helper: 'Text messages live in the SMS lane and stay globally ordered.',
    accent: 'from-sky-50 via-white to-sky-50/70 dark:from-sky-950/20 dark:via-zinc-950 dark:to-sky-950/10',
    icon: MessageSquareMore,
  },
  email: {
    label: 'Email',
    helper: 'Email blocks keep reply and consent handling visible.',
    accent: 'from-emerald-50 via-white to-emerald-50/70 dark:from-emerald-950/20 dark:via-zinc-950 dark:to-emerald-950/10',
    icon: Mail,
  },
  voicemail: {
    label: 'Voicemail',
    helper: 'Voicemail blocks stay separate from live call flows.',
    accent: 'from-amber-50 via-white to-amber-50/70 dark:from-amber-950/20 dark:via-zinc-950 dark:to-amber-950/10',
    icon: MicVocal,
  },
}

const nodeCatalog: PaletteItem[] = [
  {
    kind: 'condition',
    label: 'Condition',
    laneKey: 'logic',
    helper: 'Branch on consent, reply state, or any flat rule group.',
    summary: 'Binary true / false branch with flat AND/OR logic.',
    icon: GitBranch,
    accent: 'from-zinc-50 via-white to-violet-50/40 dark:from-zinc-900 dark:via-zinc-950 dark:to-violet-950/20',
  },
  {
    kind: 'wait',
    label: 'Wait',
    laneKey: 'logic',
    helper: 'Pause the run for a fixed amount of time.',
    summary: 'Elapsed-time delay only in v1.',
    icon: Clock3,
    accent: 'from-zinc-50 via-white to-slate-50/70 dark:from-zinc-900 dark:via-zinc-950 dark:to-slate-950/20',
  },
  {
    kind: 'exit',
    label: 'Exit',
    laneKey: 'logic',
    helper: 'Terminate the workflow immediately.',
    summary: 'No further steps are scheduled after this block.',
    icon: XCircle,
    accent: 'from-zinc-50 via-white to-rose-50/70 dark:from-zinc-900 dark:via-zinc-950 dark:to-rose-950/20',
  },
  {
    kind: 'sms',
    label: 'SMS',
    laneKey: 'sms',
    helper: 'Send a consent-gated text message.',
    summary: 'Reply handling, STOP keywords, and delivery events.',
    icon: MessageSquareMore,
    accent: 'from-sky-50 via-white to-sky-50/70 dark:from-sky-950/10 dark:via-zinc-950 dark:to-sky-950/20',
  },
  {
    kind: 'email',
    label: 'Email',
    laneKey: 'email',
    helper: 'Send a consent-gated email with reply threading.',
    summary: 'Subject, body, and inbound reply routing.',
    icon: Mail,
    accent: 'from-emerald-50 via-white to-emerald-50/70 dark:from-emerald-950/10 dark:via-zinc-950 dark:to-emerald-950/20',
  },
  {
    kind: 'voicemail',
    label: 'Voicemail',
    laneKey: 'voicemail',
    helper: 'Drop a recorded voicemail with AMD-aware handling.',
    summary: 'Machine detection and human answer branching.',
    icon: MicVocal,
    accent: 'from-amber-50 via-white to-amber-50/70 dark:from-amber-950/10 dark:via-zinc-950 dark:to-amber-950/20',
  },
]

const nodeIconByKind: Record<WorkflowNodeKind, typeof Workflow> = {
  sms: MessageSquareMore,
  email: Mail,
  voicemail: MicVocal,
  wait: Clock3,
  condition: GitBranch,
  exit: XCircle,
}

const smsPresets = [
  {
    id: 'sms-owner-intro',
    label: 'Owner intro text',
    helper: 'Short first-touch SMS for off-market outreach.',
    subject: 'Cold SMS opener',
    message:
      'Hi {firstName}, this is {agentName}. I am reaching out to see whether you would ever consider an offer on {address}. No pressure at all, I just wanted to ask.',
  },
  {
    id: 'sms-as-is-offer',
    label: 'As-is offer opener',
    helper: 'Useful when the angle is convenience and speed.',
    subject: 'As-is SMS',
    message:
      'Hi {firstName}, I buy homes in {city} as-is and can make the process simple if selling {address} is ever something you would consider. Would you be open to a quick conversation?',
  },
  {
    id: 'sms-gentle-follow-up',
    label: 'Gentle follow-up',
    helper: 'Second-touch message that stays low pressure.',
    subject: 'Follow-up SMS',
    message:
      'Hi {firstName}, following up in case my earlier note got buried. If selling {address} is not on your radar, no worries. If it is, I would be happy to share what a simple cash offer could look like.',
  },
] as const

const emailPresets = [
  {
    id: 'email-owner-intro',
    label: 'Cold owner intro',
    helper: 'Direct email for first outreach to a property owner.',
    subject: 'Quick question about {address}',
    message:
      'Hi {firstName},\n\nMy name is {agentName}. I am reaching out because I am interested in buying a home in {city}, and {address} came up in my research. I know this is out of the blue, but if you would ever consider selling, I would be glad to have a quick conversation and make the process simple.\n\nIf it is not a fit, no problem at all.\n\nBest,\n{agentName}',
  },
  {
    id: 'email-as-is-offer',
    label: 'As-is offer email',
    helper: 'Frames convenience and simplicity for motivated sellers.',
    subject: 'Would you consider an as-is offer on {address}?',
    message:
      'Hi {firstName},\n\nI wanted to reach out and ask whether you would ever consider an as-is offer on {address}. I work with owners who want a straightforward sale without repairs, listings, or drawn-out timelines.\n\nIf you are open to it, I can send over a simple range and next steps.\n\nBest,\n{agentName}',
  },
  {
    id: 'email-soft-follow-up',
    label: 'Soft follow-up email',
    helper: 'Friendly follow-up that keeps the tone personal.',
    subject: 'Following up on {address}',
    message:
      'Hi {firstName},\n\nI wanted to follow up on my earlier note about {address}. If selling is not something you are considering, feel free to ignore this. If it is a possibility now or later, I would be glad to make you a simple no-obligation offer.\n\nThanks,\n{agentName}',
  },
] as const

const waitUnits: WaitUnit[] = ['minutes', 'hours', 'days']
const conditionComparators: RuleComparator[] = ['equals', 'contains', 'exists', 'is_granted', 'is_denied']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatTime(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

function IconRenderer({
  icon: Icon,
  className,
}: {
  icon: typeof Workflow
  className?: string
}) {
  return <Icon className={className} />
}

function laneForKind(kind: WorkflowNodeKind): WorkflowLaneKey {
  if (kind === 'sms') return 'sms'
  if (kind === 'email') return 'email'
  if (kind === 'voicemail') return 'voicemail'
  return 'logic'
}

function kindLabel(kind: WorkflowNodeKind) {
  return nodeCatalog.find((item) => item.kind === kind)?.label ?? kind
}

function getNodeSummary(kind: WorkflowNodeKind, config: WorkflowNodeConfig) {
  if (kind === 'sms') {
    return config.message?.trim() || config.subject?.trim() || 'Write the SMS content.'
  }

  if (kind === 'email') {
    if (config.subject?.trim()) {
      return `Subject: ${config.subject.trim()}`
    }
    return config.message?.trim() || 'Write the email content.'
  }

  if (kind === 'voicemail') {
    return config.voicemailAssetLabel?.trim()
      ? `Voicemail asset: ${config.voicemailAssetLabel.trim()}`
      : 'Attach a voicemail asset and message summary.'
  }

  if (kind === 'wait') {
    const amount = config.waitAmount ?? 1
    return `Wait ${amount} ${config.waitUnit ?? 'days'}`
  }

  if (kind === 'condition') {
    const ruleCount = config.rules?.length ?? 0
    const operator = (config.operator ?? 'and').toUpperCase()
    return `${ruleCount} rule${ruleCount === 1 ? '' : 's'} with ${operator} logic`
  }

  return config.exitReason?.trim() || 'End the workflow.'
}

function defaultConfig(kind: WorkflowNodeKind): WorkflowNodeConfig {
  if (kind === 'sms') {
    return {
      subject: 'Cold SMS opener',
      message:
        'Hi {firstName}, this is {agentName}. I am reaching out to see whether you would ever consider an offer on {address}.',
    }
  }

  if (kind === 'email') {
    return {
      subject: 'Quick question about {address}',
      message:
        'Hi {firstName},\n\nI wanted to reach out with a quick question about {address}.',
    }
  }

  if (kind === 'voicemail') {
    return {
      voicemailAssetLabel: 'Neighborhood update v1',
      message: 'Recorded voicemail drop with a short follow-up summary.',
    }
  }

  if (kind === 'wait') {
    return {
      waitAmount: 2,
      waitUnit: 'days',
    }
  }

  if (kind === 'condition') {
    return {
      operator: 'and',
      rules: [
        {
          id: makeId('rule'),
          field: 'consent_status',
          comparator: 'equals',
          value: 'granted',
        },
      ],
    }
  }

  return {
    exitReason: 'Sequence complete',
  }
}

function defaultNodeTitle(kind: WorkflowNodeKind) {
  return kindLabel(kind)
}

function createNode(kind: WorkflowNodeKind, sequence: number, overrides?: Partial<WorkflowNode>): WorkflowNode {
  const config = { ...defaultConfig(kind), ...(overrides?.config || {}) }
  return {
    id: overrides?.id || makeId('node'),
    kind,
    laneKey: overrides?.laneKey || laneForKind(kind),
    sequence,
    title: overrides?.title || defaultNodeTitle(kind),
    summary: overrides?.summary || getNodeSummary(kind, config),
    config,
    legacy: overrides?.legacy ?? false,
    locked: overrides?.locked ?? false,
  }
}

function createExitNode(sequence: number, locked = false) {
  return createNode('exit', sequence, {
    title: 'Exit',
    summary: 'Terminate the run and stop scheduling further steps.',
    config: {
      exitReason: 'Workflow complete',
    },
    locked,
  })
}

function pickWorkflowRecord(value: unknown) {
  if (isRecord(value)) return value
  if (Array.isArray(value)) {
    return (
      value.find((item) => isRecord(item) && ('nodes' in item || 'edges' in item || 'steps' in item || 'snapshot' in item)) ??
      value.find(isRecord) ??
      null
    )
  }
  return null
}

function getCampaignWorkflowSource(campaign: WorkflowCampaignRecord) {
  const rawWorkflow = [
    campaign.workflow,
    campaign.workflowVersion,
    campaign.workflowVersions,
    campaign.draft?.workflow,
    campaign.draft?.workflowVersion,
  ]
    .map(pickWorkflowRecord)
    .find(Boolean)

  if (!isRecord(rawWorkflow)) return null
  const snapshot = rawWorkflow.snapshot
  if (isRecord(snapshot)) {
    if (Array.isArray(snapshot.nodes) || Array.isArray(snapshot.steps)) {
      return snapshot
    }
  }

  return rawWorkflow
}

function parseRawRules(value: unknown): ConditionRule[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((rule) => {
    if (!isRecord(rule)) return []
    return [
      {
        id: typeof rule.id === 'string' ? rule.id : makeId('rule'),
        field: typeof rule.field === 'string' ? rule.field : 'consent_status',
        comparator: conditionComparators.includes(rule.comparator as RuleComparator)
          ? (rule.comparator as RuleComparator)
          : 'equals',
        value: typeof rule.value === 'string' ? rule.value : '',
      },
    ]
  })
}

function parseNodeConfig(raw: Record<string, unknown> | null, kind: WorkflowNodeKind): WorkflowNodeConfig {
  const config = defaultConfig(kind)
  if (!raw) return config

  return {
    ...config,
    subject: typeof raw.subject === 'string' ? raw.subject : typeof raw.templateLabel === 'string' ? raw.templateLabel : config.subject,
    message: typeof raw.message === 'string' ? raw.message : typeof raw.preview === 'string' ? raw.preview : config.message,
    voicemailAssetLabel:
      typeof raw.voicemailAssetLabel === 'string'
        ? raw.voicemailAssetLabel
        : typeof raw.voicemail_asset_label === 'string'
          ? raw.voicemail_asset_label
          : config.voicemailAssetLabel,
    waitAmount:
      typeof raw.waitAmount === 'number'
        ? raw.waitAmount
        : typeof raw.wait_amount === 'number'
          ? raw.wait_amount
          : config.waitAmount,
    waitUnit:
      raw.waitUnit === 'minutes' || raw.waitUnit === 'hours' || raw.waitUnit === 'days'
        ? raw.waitUnit
        : raw.wait_unit === 'minutes' || raw.wait_unit === 'hours' || raw.wait_unit === 'days'
          ? (raw.wait_unit as WaitUnit)
          : config.waitUnit,
    operator: raw.operator === 'or' ? 'or' : 'and',
    rules: parseRawRules(raw.rules ?? raw.conditionRules ?? raw.condition_rules),
    trueTargetId:
      typeof raw.trueTargetId === 'string'
        ? raw.trueTargetId
        : typeof raw.true_target_id === 'string'
          ? raw.true_target_id
          : config.trueTargetId ?? null,
    falseTargetId:
      typeof raw.falseTargetId === 'string'
        ? raw.falseTargetId
        : typeof raw.false_target_id === 'string'
          ? raw.false_target_id
          : config.falseTargetId ?? null,
    exitReason:
      typeof raw.exitReason === 'string'
        ? raw.exitReason
        : typeof raw.exit_reason === 'string'
          ? raw.exit_reason
          : config.exitReason,
  }
}

function parseNodes(raw: unknown, fallbackKind: WorkflowNodeKind, locked = false): WorkflowNode[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((item, index) => {
    if (!isRecord(item)) return []

    const kindValue = item.kind || item.nodeKind || item.node_kind || item.actionType || item.action_type
    const kind = ['sms', 'email', 'voicemail', 'wait', 'condition', 'exit'].includes(kindValue as string)
      ? (kindValue as WorkflowNodeKind)
      : fallbackKind
    const sequence =
      typeof item.sequence === 'number'
        ? item.sequence
        : typeof item.order === 'number'
          ? item.order
          : typeof item.step_order === 'number'
            ? item.step_order
            : index + 1
    const config = parseNodeConfig(
      isRecord(item.config)
        ? item.config
        : isRecord(item.node_config)
          ? item.node_config
          : isRecord(item.content_payload)
            ? item.content_payload
            : null,
      kind
    )

    return [
      {
        id: typeof item.id === 'string' ? item.id : makeId('node'),
        kind,
        laneKey:
          item.laneKey === 'logic' || item.laneKey === 'sms' || item.laneKey === 'email' || item.laneKey === 'voicemail'
            ? item.laneKey
            : item.lane_key === 'logic' || item.lane_key === 'sms' || item.lane_key === 'email' || item.lane_key === 'voicemail'
              ? item.lane_key
              : laneForKind(kind),
        sequence,
        title:
          typeof item.title === 'string'
            ? item.title
            : typeof item.label === 'string'
              ? item.label
              : typeof item.template_label === 'string'
                ? item.template_label
                : defaultNodeTitle(kind),
        summary:
          typeof item.summary === 'string'
            ? item.summary
            : typeof item.description === 'string'
              ? item.description
              : getNodeSummary(kind, config),
        config,
        legacy: typeof item.legacy === 'boolean' ? item.legacy : true,
        locked: typeof item.locked === 'boolean' ? item.locked : locked,
      },
    ]
  })
}

function parseEdges(raw: unknown): WorkflowEdge[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((item) => {
    if (!isRecord(item)) return []
    const kindValue = item.kind === 'true' || item.kind === 'false' || item.kind === 'next' ? item.kind : 'next'

    return [
      {
        id: typeof item.id === 'string' ? item.id : makeId('edge'),
        from: typeof item.from === 'string' ? item.from : typeof item.source === 'string' ? item.source : '',
        to: typeof item.to === 'string' ? item.to : typeof item.target === 'string' ? item.target : '',
        kind: kindValue,
        label: typeof item.label === 'string' ? item.label : undefined,
      },
    ]
  })
}

function deriveEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = []
  const ordered = [...nodes].sort((a, b) => a.sequence - b.sequence)

  ordered.forEach((node, index) => {
    if (node.kind === 'exit') return

    if (node.kind === 'condition') {
      const fallthrough = ordered.slice(index + 1)
      const trueTarget = node.config.trueTargetId || fallthrough[0]?.id || ''
      const falseTarget = node.config.falseTargetId || fallthrough[1]?.id || fallthrough[0]?.id || ''

      if (trueTarget) {
        edges.push({
          id: makeId('edge'),
          from: node.id,
          to: trueTarget,
          kind: 'true',
          label: 'true',
        })
      }

      if (falseTarget) {
        edges.push({
          id: makeId('edge'),
          from: node.id,
          to: falseTarget,
          kind: 'false',
          label: 'false',
        })
      }

      return
    }

    const nextNode = ordered[index + 1]
    if (nextNode) {
      edges.push({
        id: makeId('edge'),
        from: node.id,
        to: nextNode.id,
        kind: 'next',
      })
    }
  })

  return edges
}

function normalizeConsentBucket(value: unknown): ConsentBucket {
  const fallback: ConsentBucket = {
    granted: 0,
    denied: 0,
    unknown: 0,
    missing_consent: 0,
    suppressed: 0,
  }

  if (!isRecord(value)) return fallback

  return {
    granted: Number(value.granted ?? value.allowed ?? 0),
    denied: Number(value.denied ?? value.blocked ?? 0),
    unknown: Number(value.unknown ?? 0),
    missing_consent: Number(value.missing_consent ?? value.missingConsent ?? 0),
    suppressed: Number(value.suppressed ?? value.suppressedCount ?? 0),
  }
}

function normalizeConsentSummary(value: unknown): ConsentSummary | null {
  if (!isRecord(value)) return null

  const sms = value.sms ?? value.smsConsent ?? value.sms_consent
  const email = value.email ?? value.emailConsent ?? value.email_consent
  const voice = value.voice ?? value.voiceConsent ?? value.voice_consent

  const any =
    isRecord(sms) ||
    isRecord(email) ||
    isRecord(voice) ||
    'sms' in value ||
    'email' in value ||
    'voice' in value

  if (!any) return null

  return {
    sms: normalizeConsentBucket(sms),
    email: normalizeConsentBucket(email),
    voice: normalizeConsentBucket(voice),
  }
}

function buildLegacySnapshot(campaign: WorkflowCampaignRecord): WorkflowSnapshot {
  const locked =
    ['active', 'partially_failed', 'failed', 'archived'].includes(campaign.launchState || '') ||
    campaign.readOnlyWorkflow === true
  const fromWorkflow = getCampaignWorkflowSource(campaign)
  const workflowNodes = parseNodes(fromWorkflow?.nodes ?? fromWorkflow?.steps, 'sms', locked)
  const workflowEdges = parseEdges(fromWorkflow?.edges)
  const baseNodes =
    workflowNodes.length > 0
      ? workflowNodes
      : (() => {
          const baseKind =
            campaign.channel === 'email'
              ? 'email'
              : campaign.channel === 'voice'
                ? 'voicemail'
                : campaign.channel === 'multi'
                  ? 'sms'
                  : 'sms'

          const starter = createNode(baseKind, 1, {
            title: campaign.name,
            summary:
              baseKind === 'voicemail'
                ? 'Starter voicemail flow converted from a legacy campaign.'
                : 'Starter message converted from a legacy campaign.',
            legacy: true,
            locked,
          })
          const exit = createExitNode(2, locked)
          return [starter, exit]
        })()

  const ordered: WorkflowNode[] = [...baseNodes]
    .sort((a, b) => a.sequence - b.sequence)
    .map((node, index) => ({
      ...node,
      sequence: index + 1,
      legacy: true,
      locked,
    }))

  if (!ordered.some((node) => node.kind === 'exit')) {
    ordered.push(createExitNode(ordered.length + 1, locked))
  }

  const normalized = ordered.map((node, index) => ({
    ...node,
    sequence: index + 1,
    summary: getNodeSummary(node.kind, node.config),
  }))

  const edges = workflowEdges.length > 0 ? workflowEdges : deriveEdges(normalized)
  const launched = ['active', 'partially_failed', 'failed'].includes(campaign.launchState || '')
  const versions: WorkflowVersionSummary[] = []

  if (launched || campaign.launchedAt) {
    versions.push({
      id: campaign.id,
      label: launched ? 'Launched snapshot' : 'Immutable snapshot',
      status: 'launched',
      createdAt: campaign.lastReviewAt || campaign.launchedAt || new Date().toISOString(),
      launchedAt: campaign.launchedAt || campaign.lastReviewAt || null,
      immutable: true,
      description: `Legacy campaign rendered as a read-only workflow with ${normalized.length} blocks.`,
      nodeCount: normalized.length,
      edgeCount: edges.length,
    })
  }

  versions.push({
    id: `${campaign.id}-draft`,
    label: 'Editable draft',
    status: 'draft',
    createdAt: new Date().toISOString(),
    launchedAt: null,
    immutable: false,
    description: 'Local workflow draft that autosaves in the browser.',
    nodeCount: normalized.length,
    edgeCount: edges.length,
  })

  return {
    nodes: normalized,
    edges,
    versions,
    selectedNodeId: normalized[0]?.id || null,
    sourceLabel:
      campaign.convertedLegacyFlow || campaign.channel !== 'multi' ? 'Converted legacy flow' : 'Workflow native',
    mode: locked ? 'read-only' : campaign.channel === 'multi' ? 'draft' : 'legacy-converted',
    savedAt: new Date().toISOString(),
  }
}

function getWorkflowStorageKey(campaignId: string) {
  return `marketing-workflow:${campaignId}`
}

function loadStoredWorkflow(campaignId: string): WorkflowSnapshot | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(getWorkflowStorageKey(campaignId))
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed) && Array.isArray(parsed.nodes)) {
      return parsed as WorkflowSnapshot
    }
    if (isRecord(parsed) && isRecord(parsed.snapshot) && Array.isArray(parsed.snapshot.nodes)) {
      return parsed.snapshot as WorkflowSnapshot
    }
  } catch {
    return null
  }

  return null
}

function saveStoredWorkflow(campaignId: string, snapshot: WorkflowSnapshot) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getWorkflowStorageKey(campaignId), JSON.stringify(snapshot))
}

function WorkflowPaletteItemButton({
  item,
  disabled,
  onAdd,
}: {
  item: PaletteItem
  disabled?: boolean
  onAdd: (kind: WorkflowNodeKind) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${item.kind}`,
    disabled,
    data: { type: 'palette', kind: item.kind },
  })

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
      }}
      onClick={() => !disabled && onAdd(item.kind)}
      className={cn(
        'group w-full rounded-2xl border bg-background p-3 text-left transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        isDragging ? 'opacity-60 ring-2 ring-sky-500' : 'hover:border-sky-300',
        disabled && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none'
      )}
      {...attributes}
      {...listeners}
    >
      <div
        className={cn(
          'rounded-xl border p-3 shadow-sm backdrop-blur',
          'bg-white/75 dark:bg-zinc-950/65',
          item.accent
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IconRenderer icon={item.icon} className="size-4 text-foreground/80" />
              <p className="text-sm font-semibold">{item.label}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {laneMeta[item.laneKey].label}
          </Badge>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{item.summary}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GripVertical className="size-3.5" />
          Drag or click to add
        </div>
        <span className="inline-flex h-8 items-center rounded-md border px-2 text-xs font-medium text-muted-foreground">
          <Plus className="mr-1.5 size-3.5" />
          Add
        </span>
      </div>
    </button>
  )
}

function WorkflowNodeCard({
  node,
  selected,
  readOnly,
  onSelect,
}: {
  node: WorkflowNode
  selected: boolean
  readOnly: boolean
  onSelect: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: node.id,
    disabled: readOnly,
    data: { type: 'node', nodeId: node.id },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: node.id,
    data: { type: 'node', nodeId: node.id, laneKey: node.laneKey },
  })

  return (
    <div ref={setDropRef} className="relative">
      <div
        ref={setDragRef}
        style={{
          transform: CSS.Transform.toString(transform),
        }}
        className={cn(
          'group rounded-2xl border bg-background p-3 shadow-sm transition-all',
          selected && 'ring-2 ring-sky-500',
          isDragging && 'opacity-60 shadow-lg',
          isOver && 'border-sky-300 bg-sky-50/70 dark:bg-sky-950/20'
        )}
        onClick={() => onSelect(node.id)}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Layers3 className="size-3.5" />
                Step {node.sequence}
              </Badge>
              <Badge variant="outline">{laneMeta[node.laneKey].label}</Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full border bg-muted/40">
                <IconRenderer icon={nodeIconByKind[node.kind]} className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{node.title}</p>
                <p className="truncate text-xs text-muted-foreground">{node.summary}</p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            {node.locked ? <Badge variant="outline">Locked</Badge> : null}
            <div className="rounded-full border p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              <GripVertical className="size-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkflowLaneView({
  laneKey,
  nodes,
  readOnly,
  selectedNodeId,
  onSelectNode,
}: {
  laneKey: WorkflowLaneKey
  nodes: WorkflowNode[]
  readOnly: boolean
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `lane-${laneKey}`,
    data: { type: 'lane', laneKey },
  })
  const lane = laneMeta[laneKey]

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full border bg-background shadow-sm">
            <IconRenderer icon={lane.icon} className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">{lane.label}</p>
            <p className="text-xs text-muted-foreground">{lane.helper}</p>
          </div>
        </div>
        <Badge variant="outline">{nodes.length}</Badge>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[18rem] rounded-3xl border border-dashed p-3 transition-colors',
          'bg-gradient-to-br',
          lane.accent,
          isOver ? 'border-sky-300 shadow-[0_0_0_1px_rgba(14,165,233,0.25)]' : 'border-border/70'
        )}
      >
        <div className="space-y-3">
          {nodes.length > 0 ? (
            nodes.map((node) => (
              <WorkflowNodeCard
                key={node.id}
                node={node}
                selected={selectedNodeId === node.id}
                readOnly={readOnly}
                onSelect={onSelectNode}
              />
            ))
          ) : (
            <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed bg-background/60 p-4 text-center text-sm text-muted-foreground">
              Drop a {lane.label.toLowerCase()} block here or add one from the palette.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkflowInspector({
  campaign,
  snapshot,
  selectedNode,
  onUpdateNode,
  onDuplicateNode,
  onDeleteNode,
}: {
  campaign: WorkflowCampaignRecord
  snapshot: WorkflowSnapshot
  selectedNode: WorkflowNode | null
  onUpdateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void
  onDuplicateNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}) {
  const consentSummary = normalizeConsentSummary(campaign.consentSummary)
  const eligibleCount = Number(campaign.eligibleCount ?? 0)
  const suppressedCount = Number(campaign.suppressedCount ?? 0)
  const ineligibleCount = Number(campaign.ineligibleCount ?? 0)
  const missingConsentCount = consentSummary
    ? consentSummary.sms.missing_consent + consentSummary.email.missing_consent + consentSummary.voice.missing_consent
    : null

  const laterTargets = snapshot.nodes.filter((node) => node.sequence > (selectedNode?.sequence ?? 0))

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <Wand2 className="size-3.5" />
              Inspector
            </Badge>
            <Badge variant="outline">{snapshot.sourceLabel}</Badge>
            <Badge variant="outline">{snapshot.mode === 'read-only' ? 'Immutable' : 'Editable'}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">
              {selectedNode ? `${kindLabel(selectedNode.kind)} settings` : 'Select a block'}
            </CardTitle>
            <CardDescription>
              {selectedNode
                ? 'Tune the selected block, keep sequence numbers visible, and wire branch targets when needed.'
                : 'Click a block in the canvas to edit it here.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedNode ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Sequence</p>
                  <p className="mt-1 text-lg font-semibold">Step {selectedNode.sequence}</p>
                  <p className="text-xs text-muted-foreground">{laneMeta[selectedNode.laneKey].label} lane</p>
                </div>
                <div className="rounded-2xl border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">State</p>
                  <p className="mt-1 text-lg font-semibold">{selectedNode.locked ? 'Read only' : 'Editable'}</p>
                  <p className="text-xs text-muted-foreground">{selectedNode.legacy ? 'Converted from a legacy campaign.' : 'Native workflow block.'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Block label</p>
                <Input
                  value={selectedNode.title}
                  onChange={(event) => onUpdateNode(selectedNode.id, { title: event.target.value })}
                  disabled={snapshot.mode === 'read-only'}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Summary</p>
                <Textarea
                  value={selectedNode.summary}
                  onChange={(event) => onUpdateNode(selectedNode.id, { summary: event.target.value })}
                  className="min-h-24"
                  disabled={snapshot.mode === 'read-only'}
                />
              </div>

              {selectedNode.kind === 'sms' || selectedNode.kind === 'email' ? (
                <div className="space-y-3 rounded-2xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Template presets</p>
                      <p className="text-xs text-muted-foreground">
                        Keep the current plain-language presets while editing the workflow graph.
                      </p>
                    </div>
                    <Badge variant="outline">
                      {selectedNode.kind === 'sms' ? smsPresets.length : emailPresets.length} presets
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    {(selectedNode.kind === 'sms' ? smsPresets : emailPresets).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          onUpdateNode(selectedNode.id, {
                            title: preset.label,
                            summary: preset.subject,
                            config: {
                              ...selectedNode.config,
                              subject: preset.subject,
                              message: preset.message,
                            },
                          })
                        }
                        disabled={snapshot.mode === 'read-only'}
                        className={cn(
                          'rounded-xl border bg-background p-3 text-left transition-colors',
                          'hover:border-sky-300 hover:bg-sky-50/50 dark:hover:bg-sky-950/20',
                          snapshot.mode === 'read-only' && 'cursor-not-allowed opacity-70'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{preset.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{preset.helper}</p>
                          </div>
                          <Badge variant="outline">Apply</Badge>
                        </div>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">Subject: {preset.subject}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedNode.kind === 'sms' || selectedNode.kind === 'email' || selectedNode.kind === 'voicemail' ? (
                <div className="grid gap-3">
                  {selectedNode.kind === 'email' ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Subject</p>
                      <Input
                        value={selectedNode.config.subject ?? ''}
                        onChange={(event) =>
                          onUpdateNode(selectedNode.id, {
                            config: {
                              ...selectedNode.config,
                              subject: event.target.value,
                            },
                            summary: event.target.value ? `Subject: ${event.target.value}` : 'Write the email content.',
                          })
                        }
                        disabled={snapshot.mode === 'read-only'}
                      />
                    </div>
                  ) : null}

                  {(selectedNode.kind === 'sms' || selectedNode.kind === 'email') ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Message</p>
                      <Textarea
                        value={selectedNode.config.message ?? ''}
                        onChange={(event) =>
                          onUpdateNode(selectedNode.id, {
                            config: {
                              ...selectedNode.config,
                              message: event.target.value,
                            },
                            summary:
                              selectedNode.kind === 'sms'
                                ? event.target.value || 'Write the SMS content.'
                                : selectedNode.config.subject?.trim()
                                  ? `Subject: ${selectedNode.config.subject.trim()}`
                                  : event.target.value || 'Write the email content.',
                          })
                        }
                        className="min-h-28"
                        disabled={snapshot.mode === 'read-only'}
                      />
                    </div>
                  ) : null}

                  {selectedNode.kind === 'voicemail' ? (
                    <>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Voicemail asset label</p>
                        <Input
                          value={selectedNode.config.voicemailAssetLabel ?? ''}
                          onChange={(event) =>
                            onUpdateNode(selectedNode.id, {
                              config: {
                                ...selectedNode.config,
                                voicemailAssetLabel: event.target.value,
                              },
                            })
                          }
                          disabled={snapshot.mode === 'read-only'}
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Voicemail summary</p>
                        <Textarea
                          value={selectedNode.config.message ?? ''}
                          onChange={(event) =>
                            onUpdateNode(selectedNode.id, {
                              config: {
                                ...selectedNode.config,
                                message: event.target.value,
                              },
                            })
                          }
                          className="min-h-24"
                          disabled={snapshot.mode === 'read-only'}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {selectedNode.kind === 'wait' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Delay amount</p>
                    <Input
                      type="number"
                      min={1}
                      value={selectedNode.config.waitAmount ?? 1}
                      onChange={(event) =>
                        onUpdateNode(selectedNode.id, {
                          config: {
                            ...selectedNode.config,
                            waitAmount: Math.max(1, Number(event.target.value || 1)),
                          },
                          summary: `Wait ${Math.max(1, Number(event.target.value || 1))} ${selectedNode.config.waitUnit ?? 'days'}`,
                        })
                      }
                      disabled={snapshot.mode === 'read-only'}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Delay unit</p>
                    <Select
                      value={selectedNode.config.waitUnit ?? 'days'}
                      onValueChange={(value) =>
                        onUpdateNode(selectedNode.id, {
                          config: {
                            ...selectedNode.config,
                            waitUnit: value as WaitUnit,
                          },
                          summary: `Wait ${selectedNode.config.waitAmount ?? 1} ${value}`,
                        })
                      }
                      disabled={snapshot.mode === 'read-only'}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {waitUnits.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              {selectedNode.kind === 'condition' ? (
                <div className="space-y-4 rounded-2xl border bg-muted/20 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Logic mode</p>
                      <Select
                        value={selectedNode.config.operator ?? 'and'}
                        onValueChange={(value) =>
                          onUpdateNode(selectedNode.id, {
                            config: {
                              ...selectedNode.config,
                              operator: value as ConditionOperator,
                            },
                            summary: `${selectedNode.config.rules?.length ?? 0} rule${(selectedNode.config.rules?.length ?? 0) === 1 ? '' : 's'} with ${(value as ConditionOperator).toUpperCase()} logic`,
                          })
                        }
                        disabled={snapshot.mode === 'read-only'}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose logic" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="and">All rules must match</SelectItem>
                          <SelectItem value="or">Any rule can match</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Branch target preview</p>
                      <div className="rounded-xl border bg-background p-3 text-xs text-muted-foreground">
                        True and false branches stay flat and can only point to later blocks in the workflow.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Rules</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (snapshot.mode === 'read-only') return
                          onUpdateNode(selectedNode.id, {
                            config: {
                              ...selectedNode.config,
                              rules: [
                                ...(selectedNode.config.rules ?? []),
                                {
                                  id: makeId('rule'),
                                  field: 'consent_status',
                                  comparator: 'equals',
                                  value: 'granted',
                                },
                              ],
                            },
                          })
                        }}
                        disabled={snapshot.mode === 'read-only'}
                      >
                        <Plus className="mr-1.5 size-3.5" />
                        Add rule
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {(selectedNode.config.rules ?? []).map((rule, ruleIndex) => (
                        <div key={rule.id} className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-[1.1fr_0.9fr_1fr_auto]">
                          <Input
                            value={rule.field}
                            onChange={(event) => {
                              const nextRules = [...(selectedNode.config.rules ?? [])]
                              nextRules[ruleIndex] = { ...rule, field: event.target.value }
                              onUpdateNode(selectedNode.id, {
                                config: {
                                  ...selectedNode.config,
                                  rules: nextRules,
                                },
                              })
                            }}
                            disabled={snapshot.mode === 'read-only'}
                            placeholder="Field"
                          />
                          <Select
                            value={rule.comparator}
                            onValueChange={(value) => {
                              const nextRules = [...(selectedNode.config.rules ?? [])]
                              nextRules[ruleIndex] = { ...rule, comparator: value as RuleComparator }
                              onUpdateNode(selectedNode.id, {
                                config: {
                                  ...selectedNode.config,
                                  rules: nextRules,
                                },
                              })
                            }}
                            disabled={snapshot.mode === 'read-only'}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Comparator" />
                            </SelectTrigger>
                            <SelectContent>
                              {conditionComparators.map((comparator) => (
                                <SelectItem key={comparator} value={comparator}>
                                  {comparator}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={rule.value}
                            onChange={(event) => {
                              const nextRules = [...(selectedNode.config.rules ?? [])]
                              nextRules[ruleIndex] = { ...rule, value: event.target.value }
                              onUpdateNode(selectedNode.id, {
                                config: {
                                  ...selectedNode.config,
                                  rules: nextRules,
                                },
                              })
                            }}
                            disabled={snapshot.mode === 'read-only'}
                            placeholder="Value"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (snapshot.mode === 'read-only') return
                              const nextRules = [...(selectedNode.config.rules ?? [])].filter((_, index) => index !== ruleIndex)
                              onUpdateNode(selectedNode.id, {
                                config: {
                                  ...selectedNode.config,
                                  rules: nextRules,
                                },
                              })
                            }}
                            disabled={snapshot.mode === 'read-only'}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">True target</p>
                      <Select
                        value={selectedNode.config.trueTargetId || ''}
                        onValueChange={(value) =>
                          onUpdateNode(selectedNode.id, {
                            config: {
                              ...selectedNode.config,
                              trueTargetId: value || null,
                            },
                          })
                        }
                        disabled={snapshot.mode === 'read-only'}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose target" />
                        </SelectTrigger>
                        <SelectContent>
                          {laterTargets.length > 0 ? (
                            laterTargets.map((target) => (
                              <SelectItem key={target.id} value={target.id}>
                                Step {target.sequence} - {target.title}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>
                              Add a later block first
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">False target</p>
                      <Select
                        value={selectedNode.config.falseTargetId || ''}
                        onValueChange={(value) =>
                          onUpdateNode(selectedNode.id, {
                            config: {
                              ...selectedNode.config,
                              falseTargetId: value || null,
                            },
                          })
                        }
                        disabled={snapshot.mode === 'read-only'}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose target" />
                        </SelectTrigger>
                        <SelectContent>
                          {laterTargets.length > 0 ? (
                            laterTargets.map((target) => (
                              <SelectItem key={target.id} value={target.id}>
                                Step {target.sequence} - {target.title}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="none" disabled>
                              Add a later block first
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedNode.kind === 'exit' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Exit reason</p>
                  <Textarea
                    value={selectedNode.config.exitReason ?? ''}
                    onChange={(event) =>
                      onUpdateNode(selectedNode.id, {
                        config: {
                          ...selectedNode.config,
                          exitReason: event.target.value,
                        },
                        summary: event.target.value || 'End the workflow.',
                      })
                    }
                    className="min-h-24"
                    disabled={snapshot.mode === 'read-only'}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => onDuplicateNode(selectedNode.id)}
                  disabled={snapshot.mode === 'read-only'}
                >
                  <CopyPlus className="mr-2 size-4" />
                  Duplicate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onDeleteNode(selectedNode.id)}
                  disabled={snapshot.mode === 'read-only' || snapshot.nodes.length <= 1}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
              Select a block to edit it, or drag a new block from the palette onto the canvas.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Launch preview</CardTitle>
          <CardDescription>
            The preview mirrors the sequence users will see when the workflow snapshot is launched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Eligible</p>
              <p className="mt-1 text-2xl font-semibold">{formatNumber(eligibleCount)}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Suppressed</p>
              <p className="mt-1 text-2xl font-semibold text-red-700 dark:text-red-300">{formatNumber(suppressedCount)}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Ineligible</p>
              <p className="mt-1 text-2xl font-semibold text-amber-700 dark:text-amber-300">{formatNumber(ineligibleCount)}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Missing consent</p>
              <p className="mt-1 text-2xl font-semibold">
                {missingConsentCount === null ? '—' : formatNumber(missingConsentCount)}
              </p>
            </div>
          </div>

          {consentSummary ? (
            <div className="rounded-2xl border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Destination consent</p>
                  <p className="text-xs text-muted-foreground">
                    Each destination can carry its own consent state. The launch gate will read the per-channel summary when the backend exposes it.
                  </p>
                </div>
                <Badge variant="outline">Per destination</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {(['sms', 'email', 'voice'] as const).map((channel) => {
                  const bucket = consentSummary[channel]
                  return (
                    <div key={channel} className="rounded-xl border bg-background p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium uppercase tracking-wide">{channel}</p>
                        <Badge variant="outline">Consent</Badge>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-5">
                        {[
                          ['granted', bucket.granted],
                          ['denied', bucket.denied],
                          ['unknown', bucket.unknown],
                          ['missing', bucket.missing_consent],
                          ['suppressed', bucket.suppressed],
                        ].map(([label, count]) => (
                          <div key={label} className="rounded-lg border bg-muted/20 p-2">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                            <p className="text-sm font-semibold">{formatNumber(Number(count))}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              Destination-level consent counts are not yet present in the loaded campaign data. The builder is ready for them when the workflow API ships.
            </div>
          )}

          <div className="rounded-2xl border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Snapshot summary</p>
                <p className="text-xs text-muted-foreground">{snapshot.sourceLabel}</p>
              </div>
              <Badge variant="outline">{snapshot.versions.length} versions</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {snapshot.versions.map((version) => (
                <div key={version.id} className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{version.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{version.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{version.status}</Badge>
                      {version.immutable ? <Badge variant="outline">Immutable</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{formatNumber(version.nodeCount)} blocks</span>
                    <span>{formatNumber(version.edgeCount)} edges</span>
                    {version.launchedAt ? <span>Launched {formatTime(version.launchedAt)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function MarketingWorkflowBuilder({
  campaigns,
  selectedCampaignId,
  onSelectCampaign,
  onSaveWorkflow,
}: MarketingWorkflowBuilderProps) {
  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null)
  const [activeDrag, setActiveDrag] = useState<
    | { type: 'palette'; kind: WorkflowNodeKind }
    | { type: 'node'; nodeId: string }
    | null
  >(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [isPersisting, setIsPersisting] = useState(false)

  const isReadOnly = useMemo(() => {
    if (!selectedCampaign) return false
    return (
      ['active', 'partially_failed', 'failed', 'archived'].includes(selectedCampaign.launchState || '') ||
      selectedCampaign.readOnlyWorkflow === true
    )
  }, [selectedCampaign])

  const baseSnapshot = useMemo(() => {
    if (!selectedCampaign) return null
    return buildLegacySnapshot(selectedCampaign)
  }, [selectedCampaign])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (!selectedCampaign || !baseSnapshot) {
        setSnapshot(null)
        setSavedAt(null)
        return
      }

      const stored = !isReadOnly ? loadStoredWorkflow(selectedCampaign.id) : null
      const nextSnapshot = stored ?? baseSnapshot

      const nextNodeId =
        nextSnapshot.selectedNodeId && nextSnapshot.nodes.some((node) => node.id === nextSnapshot.selectedNodeId)
          ? nextSnapshot.selectedNodeId
          : nextSnapshot.nodes[0]?.id ?? null

      setSnapshot({
        ...nextSnapshot,
        selectedNodeId: nextNodeId,
        mode: isReadOnly ? 'read-only' : nextSnapshot.mode,
      })
      setSavedAt(stored?.savedAt ?? nextSnapshot.savedAt ?? null)
    }, 0)

    return () => window.clearTimeout(handle)
  }, [selectedCampaign, baseSnapshot, isReadOnly])

  useEffect(() => {
    if (!selectedCampaign || !snapshot || isReadOnly) return
    const handle = window.setTimeout(() => {
      const nextSnapshot = {
        ...snapshot,
        savedAt: new Date().toISOString(),
      }
      saveStoredWorkflow(selectedCampaign.id, nextSnapshot)
      setSavedAt(nextSnapshot.savedAt)
    }, 180)

    return () => window.clearTimeout(handle)
  }, [selectedCampaign, snapshot, isReadOnly])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 5,
      },
    })
  )

  const selectedNode = useMemo(
    () => snapshot?.nodes.find((node) => node.id === snapshot.selectedNodeId) ?? null,
    [snapshot]
  )
  const orderedNodes = useMemo(() => {
    if (!snapshot) return []
    return [...snapshot.nodes].sort((a, b) => a.sequence - b.sequence)
  }, [snapshot])

  const laneNodes = useMemo(() => {
    const grouped: Record<WorkflowLaneKey, WorkflowNode[]> = {
      logic: [],
      sms: [],
      email: [],
      voicemail: [],
    }

    orderedNodes.forEach((node) => {
      grouped[node.laneKey].push(node)
    })

    return grouped
  }, [orderedNodes])

  const dragOverlayNode =
    activeDrag?.type === 'node' && snapshot
      ? snapshot.nodes.find((node) => node.id === activeDrag.nodeId) ?? null
      : activeDrag?.type === 'palette'
        ? createNode(activeDrag.kind, 1)
        : null

  const updateNode = (nodeId: string, updates: Partial<WorkflowNode>) => {
    if (!snapshot || isReadOnly) return

    setSnapshot((current) => {
      if (!current) return current

      const nextNodes = current.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              ...updates,
              config: {
                ...node.config,
                ...(updates.config || {}),
              },
              summary:
                updates.summary ?? getNodeSummary(node.kind, { ...node.config, ...(updates.config || {}) }),
            }
          : node
      )

      const next = {
        ...current,
        nodes: nextNodes.map((node, index) => ({ ...node, sequence: index + 1 })),
        edges: deriveEdges(nextNodes.map((node, index) => ({ ...node, sequence: index + 1 }))),
        selectedNodeId: current.selectedNodeId,
      }

      return next
    })
  }

  const addNode = (kind: WorkflowNodeKind, targetNodeId?: string, appendToLane = false) => {
    if (!snapshot || isReadOnly) return

    setSnapshot((current) => {
      if (!current) return current

      const laneKey = laneForKind(kind)
      const nextNode = createNode(kind, 1, { legacy: current.mode === 'legacy-converted' })
      const remaining = current.nodes.filter((node) => node.id !== nextNode.id)
      const targetIndex = targetNodeId
        ? remaining.findIndex((node) => node.id === targetNodeId)
        : appendToLane
          ? (() => {
              const laneIndex = remaining.reduce((lastIndex, node, index) => (node.laneKey === laneKey ? index : lastIndex), -1)
              return laneIndex >= 0 ? laneIndex + 1 : remaining.length
            })()
          : remaining.length

      const insertIndex = targetIndex < 0 ? remaining.length : targetIndex
      const nodes = [
        ...remaining.slice(0, insertIndex),
        {
          ...nextNode,
          sequence: insertIndex + 1,
        },
        ...remaining.slice(insertIndex),
      ].map((node, index) => ({ ...node, sequence: index + 1 }))

      const next = {
        ...current,
        nodes,
        edges: deriveEdges(nodes),
        selectedNodeId: nextNode.id,
      }

      return next
    })
  }

  const duplicateNode = (nodeId: string) => {
    if (!snapshot || isReadOnly) return

    const source = snapshot.nodes.find((node) => node.id === nodeId)
    if (!source) return

    setSnapshot((current) => {
      if (!current) return current
      const insertAt = current.nodes.findIndex((node) => node.id === nodeId) + 1
      const copy: WorkflowNode = {
        ...source,
        id: makeId('node'),
        title: `${source.title} copy`,
        sequence: insertAt + 1,
        legacy: source.legacy,
        locked: false,
        config: {
          ...source.config,
          rules: source.config.rules?.map((rule) => ({ ...rule, id: makeId('rule') })) ?? source.config.rules,
        },
      }

      const nodes = [
        ...current.nodes.slice(0, insertAt),
        copy,
        ...current.nodes.slice(insertAt),
      ].map((node, index) => ({ ...node, sequence: index + 1 }))

      return {
        ...current,
        nodes,
        edges: deriveEdges(nodes),
        selectedNodeId: copy.id,
      }
    })
  }

  const deleteNode = (nodeId: string) => {
    if (!snapshot || isReadOnly) return

    setSnapshot((current) => {
      if (!current) return current
      if (current.nodes.length <= 1) return current

      const index = current.nodes.findIndex((node) => node.id === nodeId)
      const filtered = current.nodes.filter((node) => node.id !== nodeId)
      const nodes =
        filtered.length > 0 && !filtered.some((node) => node.kind === 'exit')
          ? [...filtered, createExitNode(filtered.length + 1, current.mode === 'read-only')]
          : filtered
      const numbered = nodes.map((node, nextIndex) => ({ ...node, sequence: nextIndex + 1 }))
      const selectedNodeId =
        current.selectedNodeId === nodeId
          ? numbered[Math.max(0, Math.min(index, numbered.length - 1))]?.id ?? null
          : current.selectedNodeId

      return {
        ...current,
        nodes: numbered,
        edges: deriveEdges(numbered),
        selectedNodeId,
      }
    })
  }

  const resetWorkflow = () => {
    if (!selectedCampaign || !baseSnapshot || isReadOnly) return

    window.localStorage.removeItem(getWorkflowStorageKey(selectedCampaign.id))
    setSnapshot(baseSnapshot)
    setSavedAt(baseSnapshot.savedAt)
    toast.success('Workflow reset to the converted starter flow')
  }

  const manualSave = async () => {
    if (!selectedCampaign || !snapshot || isReadOnly) return
    const nextSnapshot = {
      ...snapshot,
      savedAt: new Date().toISOString(),
    }
    saveStoredWorkflow(selectedCampaign.id, nextSnapshot)
    setSnapshot(nextSnapshot)
    setSavedAt(nextSnapshot.savedAt)

    if (!onSaveWorkflow) {
      toast.success('Workflow draft saved locally')
      return
    }

    try {
      setIsPersisting(true)
      await onSaveWorkflow({
        campaignId: selectedCampaign.id,
        nodes: nextSnapshot.nodes.map((node, index) => ({
          id: node.id,
          kind: node.kind,
          laneKey: node.laneKey,
          sequence: index + 1,
          label: node.title,
          position: {
            x: 160 + index * 180,
            y:
              node.laneKey === 'logic'
                ? 80
                : node.laneKey === 'sms'
                  ? 220
                  : node.laneKey === 'email'
                    ? 360
                    : 500,
          },
          config: {
            ...node.config,
            title: node.title,
            summary: node.summary,
          },
        })),
        edges: nextSnapshot.edges.map((edge) => ({
          id: edge.id,
          sourceNodeId: edge.from,
          targetNodeId: edge.to,
          branchKey:
            edge.kind === 'next'
              ? 'default'
              : edge.kind,
        })),
      })
      toast.success('Workflow draft saved')
    } catch (error) {
      console.error('Workflow save failed:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save workflow')
    } finally {
      setIsPersisting(false)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    if (isReadOnly) return
    const data = event.active.data.current as { type?: string; kind?: WorkflowNodeKind; nodeId?: string } | undefined
    if (data?.type === 'palette' && data.kind) {
      setActiveDrag({ type: 'palette', kind: data.kind })
    } else if (data?.type === 'node' && data.nodeId) {
      const nodeId = data.nodeId
      setActiveDrag({ type: 'node', nodeId: data.nodeId })
      setSnapshot((current) => (current ? { ...current, selectedNodeId: nodeId } : current))
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null)
    if (!snapshot || isReadOnly) return

    const activeData = event.active.data.current as { type?: string; kind?: WorkflowNodeKind; nodeId?: string } | undefined
    const overData = event.over?.data.current as { type?: string; laneKey?: WorkflowLaneKey; nodeId?: string } | undefined

    if (!event.over) return

    if (activeData?.type === 'palette' && activeData.kind) {
      if (overData?.type === 'node' && overData.nodeId) {
        addNode(activeData.kind, overData.nodeId)
      } else {
        addNode(activeData.kind, undefined, true)
      }
      return
    }

    if (activeData?.type === 'node' && activeData.nodeId) {
      setSnapshot((current) => {
        if (!current) return current

        const moving = current.nodes.find((node) => node.id === activeData.nodeId)
        if (!moving) return current

        const remainder = current.nodes.filter((node) => node.id !== moving.id)
        let insertIndex = remainder.length

        if (overData?.type === 'node' && overData.nodeId && overData.nodeId !== moving.id) {
          insertIndex = remainder.findIndex((node) => node.id === overData.nodeId)
          if (insertIndex < 0) insertIndex = remainder.length
        } else if (overData?.type === 'lane' && overData.laneKey) {
          const laneIndex = remainder.reduce((lastIndex, node, index) => (node.laneKey === moving.laneKey ? index : lastIndex), -1)
          insertIndex = laneIndex >= 0 ? laneIndex + 1 : remainder.length
        }

        const nextNodes = [
          ...remainder.slice(0, insertIndex),
          moving,
          ...remainder.slice(insertIndex),
        ].map((node, index) => ({ ...node, sequence: index + 1 }))

        return {
          ...current,
          nodes: nextNodes,
          edges: deriveEdges(nextNodes),
          selectedNodeId: moving.id,
        }
      })
    }
  }

  if (!selectedCampaign || !snapshot) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No campaign is available yet.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-gradient-to-r from-slate-50 via-white to-sky-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-sky-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <Workflow className="size-3.5" />
                  Workflow builder
                </Badge>
                <Badge variant="outline">{snapshot.sourceLabel}</Badge>
                <Badge variant="outline">{snapshot.mode === 'read-only' ? 'Immutable snapshot' : 'Editable draft'}</Badge>
                {snapshot.mode === 'legacy-converted' ? <Badge variant="outline">Converted legacy flow</Badge> : null}
                {savedAt ? <Badge variant="outline">Autosaved {formatDistanceToNow(new Date(savedAt), { addSuffix: true })}</Badge> : null}
              </div>
              <div>
                <CardTitle className="text-2xl">{selectedCampaign.name}</CardTitle>
                <CardDescription className="mt-1 max-w-3xl">
                  Drag blocks into fixed lanes, keep the global execution order visible, and tune consent-gated blocks without losing the legacy campaign shape.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedCampaign.id} onValueChange={onSelectCampaign} disabled={!campaigns.length}>
                <SelectTrigger className="min-w-56">
                  <SelectValue placeholder="Choose a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void manualSave()} disabled={isReadOnly || isPersisting}>
                {isPersisting ? 'Saving…' : 'Save draft'}
              </Button>
              <Button variant="outline" onClick={resetWorkflow} disabled={isReadOnly}>
                Reset
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Blocks</p>
              <p className="mt-1 text-xl font-semibold">{formatNumber(snapshot.nodes.length)}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Edges</p>
              <p className="mt-1 text-xl font-semibold">{formatNumber(snapshot.edges.length)}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Launch state</p>
              <p className="mt-1 text-xl font-semibold">{selectedCampaign.launchState || 'draft'}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Last review</p>
              <p className="mt-1 text-xl font-semibold">{selectedCampaign.lastReviewAt ? formatTime(selectedCampaign.lastReviewAt) : 'Not yet reviewed'}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Palette</CardTitle>
                  <CardDescription>Drag or click blocks to place them in the workflow.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[72rem] pr-3">
                    <div className="space-y-3">
                      {nodeCatalog.map((item) => (
                        <WorkflowPaletteItemButton
                          key={item.kind}
                          item={item}
                          disabled={isReadOnly}
                          onAdd={(kind) => addNode(kind)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">Lane canvas</CardTitle>
                      <CardDescription>Blocks keep their lane placement while the execution order stays global.</CardDescription>
                    </div>
                    <Badge variant="outline">{snapshot.sourceLabel}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 2xl:grid-cols-2">
                    {(Object.keys(laneMeta) as WorkflowLaneKey[]).map((laneKey) => (
                      <WorkflowLaneView
                        key={laneKey}
                        laneKey={laneKey}
                        nodes={laneNodes[laneKey]}
                        readOnly={isReadOnly}
                        selectedNodeId={snapshot.selectedNodeId}
                        onSelectNode={(id) =>
                          setSnapshot((current) => (current ? { ...current, selectedNodeId: id } : current))
                        }
                      />
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Execution order</p>
                        <p className="text-xs text-muted-foreground">
                          Numbers below reflect the actual launch order even when the visual lanes differ.
                        </p>
                      </div>
                      <Badge variant="outline">{snapshot.edges.length} edges</Badge>
                    </div>

                    <div className="mt-4 space-y-3">
                      {orderedNodes.map((node) => (
                        <div key={node.id} className="rounded-xl border bg-background p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">Step {node.sequence}</Badge>
                                <Badge variant="outline">{laneMeta[node.laneKey].label}</Badge>
                                <Badge variant="outline">{kindLabel(node.kind)}</Badge>
                              </div>
                              <p className="mt-2 text-sm font-medium">{node.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{node.summary}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {node.kind === 'condition' ? <Badge variant="outline">True / false branches</Badge> : null}
                              {node.kind === 'wait' ? <Badge variant="outline">Elapsed time only</Badge> : null}
                              {node.kind === 'exit' ? <Badge variant="outline">Workflow stops here</Badge> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <WorkflowInspector
                  campaign={selectedCampaign}
                  snapshot={snapshot}
                  selectedNode={selectedNode}
                  onUpdateNode={updateNode}
                  onDuplicateNode={duplicateNode}
                  onDeleteNode={deleteNode}
                />
              </div>
            </div>

            <DragOverlay>
              {dragOverlayNode ? (
                <div className="w-[18rem]">
                  <div className="rounded-2xl border bg-background p-3 shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Step {dragOverlayNode.sequence}</Badge>
                          <Badge variant="outline">{laneMeta[dragOverlayNode.laneKey].label}</Badge>
                        </div>
                        <p className="mt-2 text-sm font-semibold">{dragOverlayNode.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{dragOverlayNode.summary}</p>
                      </div>
                      <div className="rounded-full border p-1.5 text-muted-foreground">
                        <GripVertical className="size-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  )
}
