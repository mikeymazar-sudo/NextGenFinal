import { randomUUID } from 'crypto'

import type {
  WorkflowBranchKey,
  WorkflowConsentSummary,
  WorkflowDraft,
  WorkflowEdge,
  WorkflowLaneKey,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowVersion,
} from '@/types/marketing-workflow'
import { normalizePhoneNumber } from '@/lib/utils'

type CampaignLike = {
  id: string
  channel: string
  status: string
  draft_payload: Record<string, unknown> | null
}

type CampaignStepLike = Record<string, unknown>
type CampaignStepEdgeLike = Record<string, unknown>
type ContactLike = {
  id: string
  property_id: string
  phone_numbers: unknown[] | null
  emails: unknown[] | null
}

const DEFAULT_NODE_POSITIONS: Record<WorkflowLaneKey, { x: number; y: number }> = {
  logic: { x: 120, y: 80 },
  sms: { x: 120, y: 200 },
  email: { x: 120, y: 320 },
  voicemail: { x: 120, y: 440 },
}

export function getLaneForNodeKind(kind: WorkflowNodeKind): WorkflowLaneKey {
  if (kind === 'sms') return 'sms'
  if (kind === 'email') return 'email'
  if (kind === 'voicemail') return 'voicemail'
  return 'logic'
}

export function getActionTypeForNodeKind(kind: WorkflowNodeKind) {
  if (kind === 'sms') return 'send_sms'
  if (kind === 'email') return 'send_email'
  if (kind === 'voicemail') return 'drop_voicemail'
  return kind
}

export function getSummaryChannelForNodeKind(kind: WorkflowNodeKind) {
  if (kind === 'sms') return 'sms' as const
  if (kind === 'email') return 'email' as const
  if (kind === 'voicemail') return 'voice' as const
  return null
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function coerceString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function coerceNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getNodeKindFromStep(step: CampaignStepLike): WorkflowNodeKind {
  const explicitKind = coerceString(step.node_kind)
  if (explicitKind === 'sms' || explicitKind === 'email' || explicitKind === 'voicemail') {
    return explicitKind
  }
  if (explicitKind === 'wait' || explicitKind === 'condition' || explicitKind === 'exit') {
    return explicitKind
  }

  const actionType = coerceString(step.action_type).toLowerCase()
  const channel = coerceString(step.channel).toLowerCase()

  if (actionType.includes('wait')) return 'wait'
  if (actionType.includes('condition')) return 'condition'
  if (actionType.includes('exit')) return 'exit'
  if (actionType.includes('voicemail') || actionType.includes('drop_voicemail') || channel === 'voice') {
    return 'voicemail'
  }
  if (channel === 'email') return 'email'
  return 'sms'
}

function getNodeLabel(kind: WorkflowNodeKind, config: Record<string, unknown>, index: number) {
  const configuredLabel =
    coerceString(config.label) ||
    coerceString(config.templateLabel) ||
    coerceString(config.template_label) ||
    coerceString(config.subject)

  if (configuredLabel) {
    return configuredLabel
  }

  if (kind === 'wait') return 'Wait'
  if (kind === 'condition') return 'Condition'
  if (kind === 'exit') return 'Exit'
  if (kind === 'voicemail') return 'Voicemail'
  if (kind === 'email') return 'Email'
  if (kind === 'sms') return 'SMS'

  return `Step ${index}`
}

function parseBranchKey(value: unknown): WorkflowBranchKey {
  const normalized = coerceString(value)
  if (normalized === 'true' || normalized === 'false') {
    return normalized
  }

  return 'default'
}

function getDraftString(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function createDefaultNode(kind: WorkflowNodeKind, sequence: number, config: Record<string, unknown> = {}) {
  const laneKey = getLaneForNodeKind(kind)
  const laneOrigin = DEFAULT_NODE_POSITIONS[laneKey]

  return {
    id: randomUUID(),
    kind,
    laneKey,
    sequence,
    label: getNodeLabel(kind, config, sequence),
    position: {
      x: laneOrigin.x + Math.max(sequence - 1, 0) * 220,
      y: laneOrigin.y,
    },
    config,
  } satisfies WorkflowNode
}

function createLinearEdges(nodes: WorkflowNode[]) {
  const edges: WorkflowEdge[] = []

  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({
      id: randomUUID(),
      sourceNodeId: nodes[index].id,
      targetNodeId: nodes[index + 1].id,
      branchKey: 'default',
    })
  }

  return edges
}

export function isRunningCampaignStatus(status: string) {
  return ['launching', 'active', 'partially_failed'].includes(status)
}

export function buildLegacyWorkflowDraft(
  campaign: CampaignLike,
  steps: CampaignStepLike[]
): WorkflowDraft {
  const draftPayload = campaign.draft_payload || {}
  const orderedSteps = [...steps].sort((left, right) => {
    const leftOrder = coerceNumber(left.step_order) || 0
    const rightOrder = coerceNumber(right.step_order) || 0
    return leftOrder - rightOrder
  })

  const convertedNodes =
    orderedSteps.length > 0
      ? orderedSteps.map((step, index) => {
          const config = {
            ...((coerceRecord(step.content_payload) || {}) as Record<string, unknown>),
            ...((coerceRecord(step.node_config) || {}) as Record<string, unknown>),
          }
          const kind = getNodeKindFromStep(step)
          const fallbackNode = createDefaultNode(kind, index + 1, config)

          return {
            ...fallbackNode,
            id: coerceString(step.id) || fallbackNode.id,
            laneKey: (coerceString(step.lane_key) as WorkflowLaneKey) || fallbackNode.laneKey,
            label:
              coerceString(step.template_label) ||
              coerceString(config.templateLabel) ||
              fallbackNode.label,
            sourceStepId: coerceString(step.id) || null,
          } satisfies WorkflowNode
        })
      : [
          createDefaultNode(
            campaign.channel === 'email'
              ? 'email'
              : campaign.channel === 'voice'
                ? 'voicemail'
                : 'sms',
            1,
            {
              subject: getDraftString(draftPayload, 'subject'),
              message: getDraftString(draftPayload, 'message'),
              templateLabel: getDraftString(draftPayload, 'templateLabel'),
              templatePresetId: getDraftString(draftPayload, 'templatePresetId'),
              voicemailAssetLabel: getDraftString(draftPayload, 'voicemailAssetLabel'),
              voicemailUrl:
                getDraftString(draftPayload, 'voicemailUrl') ||
                getDraftString(draftPayload, 'voicemailAssetUrl'),
            }
          ),
        ]

  const lastNode = convertedNodes[convertedNodes.length - 1]
  const needsExitNode = lastNode?.kind !== 'exit'
  const nodes = needsExitNode
    ? [
        ...convertedNodes,
        createDefaultNode('exit', convertedNodes.length + 1, {
          exitReason: 'Workflow complete',
        }),
      ]
    : convertedNodes

  return {
    nodes,
    edges: createLinearEdges(nodes),
    readOnly: isRunningCampaignStatus(campaign.status),
    convertedFromLegacy: true,
  }
}

export function buildWorkflowDraftFromRows(
  campaign: CampaignLike,
  steps: CampaignStepLike[],
  edges: CampaignStepEdgeLike[]
): WorkflowDraft {
  const draftSteps = steps.filter((step) => {
    if (!('version_id' in step)) {
      return true
    }

    return step.version_id === null
  })

  if (draftSteps.length === 0) {
    return buildLegacyWorkflowDraft(campaign, steps)
  }

  const nodes = draftSteps
    .sort((left, right) => {
      const leftOrder = coerceNumber(left.step_order) || 0
      const rightOrder = coerceNumber(right.step_order) || 0
      return leftOrder - rightOrder
    })
    .map((step, index) => {
      const nodeConfig = {
        ...((coerceRecord(step.content_payload) || {}) as Record<string, unknown>),
        ...((coerceRecord(step.node_config) || {}) as Record<string, unknown>),
      }
      const kind = getNodeKindFromStep(step)
      const fallbackNode = createDefaultNode(kind, index + 1, nodeConfig)
      const position = coerceRecord(step.position)

      return {
        ...fallbackNode,
        id: coerceString(step.id) || fallbackNode.id,
        kind,
        laneKey:
          (coerceString(step.lane_key) as WorkflowLaneKey) || getLaneForNodeKind(kind),
        sequence: coerceNumber(step.step_order) || index + 1,
        label:
          coerceString(step.template_label) ||
          coerceString(nodeConfig.templateLabel) ||
          fallbackNode.label,
        position: {
          x: coerceNumber(position?.x) ?? fallbackNode.position.x,
          y: coerceNumber(position?.y) ?? fallbackNode.position.y,
        },
        config: nodeConfig,
        sourceStepId: coerceString(step.id) || null,
      } satisfies WorkflowNode
    })

  const draftEdges = edges
    .filter((edge) => {
      if (!('version_id' in edge)) {
        return true
      }

      return edge.version_id === null
    })
    .map((edge) => ({
      id: coerceString(edge.id) || randomUUID(),
      sourceNodeId:
        coerceString(edge.from_step_id) ||
        coerceString(edge.source_step_id) ||
        coerceString(edge.source_node_id) ||
        '',
      targetNodeId:
        coerceString(edge.to_step_id) ||
        coerceString(edge.target_step_id) ||
        coerceString(edge.target_node_id) ||
        '',
      branchKey: parseBranchKey(edge.branch_key),
      sourceStepEdgeId: coerceString(edge.id) || null,
    }))
    .filter((edge) => edge.sourceNodeId && edge.targetNodeId)

  return normalizeWorkflowDraft({
    nodes,
    edges: draftEdges,
    readOnly: false,
    convertedFromLegacy: false,
  })
}

export function normalizeWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  const sortedNodes = [...draft.nodes]
    .sort((left, right) => left.sequence - right.sequence)
    .map((node, index) => ({
      ...node,
      laneKey: getLaneForNodeKind(node.kind),
      label: node.label.trim() || getNodeLabel(node.kind, node.config, index + 1),
      sequence: index + 1,
    }))

  const nodeIds = new Set(sortedNodes.map((node) => node.id))
  const normalizedEdges = draft.edges
    .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
    .map((edge) => ({
      ...edge,
      branchKey: edge.branchKey || 'default',
    }))

  return {
    ...draft,
    nodes: sortedNodes,
    edges: normalizedEdges,
  }
}

export function validateWorkflowDraft(draft: WorkflowDraft) {
  const normalized = normalizeWorkflowDraft(draft)

  if (normalized.nodes.length === 0) {
    throw new Error('Workflow must contain at least one node.')
  }

  const nodeIds = new Set<string>()
  for (const node of normalized.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error('Workflow contains duplicate node ids.')
    }

    nodeIds.add(node.id)
  }

  const exitNodes = normalized.nodes.filter((node) => node.kind === 'exit')
  if (exitNodes.length === 0) {
    throw new Error('Workflow requires an exit node.')
  }

  const outgoingByNode = new Map<string, WorkflowEdge[]>()
  for (const edge of normalized.edges) {
    const bucket = outgoingByNode.get(edge.sourceNodeId) || []
    bucket.push(edge)
    outgoingByNode.set(edge.sourceNodeId, bucket)
  }

  for (const node of normalized.nodes) {
    const outgoing = outgoingByNode.get(node.id) || []

    if (node.kind === 'condition') {
      const trueEdges = outgoing.filter((edge) => edge.branchKey === 'true')
      const falseEdges = outgoing.filter((edge) => edge.branchKey === 'false')
      if (trueEdges.length > 1 || falseEdges.length > 1) {
        throw new Error('Condition nodes may only have one true edge and one false edge.')
      }
      continue
    }

    if (node.kind !== 'exit' && outgoing.length > 1) {
      throw new Error('Only condition nodes may branch to multiple next nodes.')
    }
  }

  return normalized
}

export function deriveWorkflowSummaryChannel(nodes: WorkflowNode[]) {
  const deliveryChannels = Array.from(
    new Set(
      nodes
        .map((node) => getSummaryChannelForNodeKind(node.kind))
        .filter((value): value is 'sms' | 'email' | 'voice' => Boolean(value))
    )
  )

  if (deliveryChannels.length === 0) {
    return 'sms' as const
  }

  if (deliveryChannels.length === 1) {
    return deliveryChannels[0]
  }

  return 'multi' as const
}

export function getWorkflowEntryNode(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  if (nodes.length === 0) return null

  const incoming = new Set(edges.map((edge) => edge.targetNodeId))
  const entry = [...nodes]
    .sort((left, right) => left.sequence - right.sequence)
    .find((node) => !incoming.has(node.id))

  return entry || [...nodes].sort((left, right) => left.sequence - right.sequence)[0]
}

export function buildWorkflowVersionSummary(
  record: Record<string, unknown>,
  nodes: WorkflowNode[] = [],
  edges: WorkflowEdge[] = []
): WorkflowVersion {
  const summaryRecord = coerceRecord(record.summary)
  const nodeKinds = nodes.map((node) => node.kind)

  return {
    id: coerceString(record.id),
    campaignId: coerceString(record.campaign_id),
    versionNumber: coerceNumber(record.version_number) || 1,
    status:
      (coerceString(record.status || record.state) as WorkflowVersion['status']) ||
      'launched',
    launchedAt: coerceString(record.launched_at) || null,
    createdAt: coerceString(record.created_at) || new Date().toISOString(),
    createdByUserId: coerceString(record.created_by_user_id) || null,
    nodeCount: coerceNumber(record.node_count) || nodes.length,
    edgeCount: coerceNumber(record.edge_count) || edges.length,
    summary: {
      channel:
        (coerceString(summaryRecord?.channel) as WorkflowVersion['summary']['channel']) ||
        deriveWorkflowSummaryChannel(nodes),
      nodeKinds:
        Array.isArray(summaryRecord?.nodeKinds)
          ? summaryRecord.nodeKinds.filter((value): value is WorkflowNodeKind => typeof value === 'string')
          : nodeKinds,
    },
  }
}

export function buildWorkflowStepRows(params: {
  campaignId: string
  versionId?: string | null
  nodes: WorkflowNode[]
  idMap?: Map<string, string>
}) {
  return params.nodes.map((node) => ({
    ...(params.idMap?.get(node.id) ? { id: params.idMap.get(node.id) } : {}),
    campaign_id: params.campaignId,
    version_id: params.versionId || null,
    step_order: node.sequence,
    channel: getSummaryChannelForNodeKind(node.kind),
    action_type: getActionTypeForNodeKind(node.kind),
    content_payload: {
      ...node.config,
      position: node.position,
    },
    template_label: node.label,
    voicemail_asset_id:
      typeof node.config.voicemailAssetId === 'string' ? node.config.voicemailAssetId : null,
    review_state: 'approved',
    execution_status: 'queued',
    node_kind: node.kind,
    lane_key: node.laneKey,
    node_config: {
      ...node.config,
      clientNodeId: node.id,
    },
  }))
}

export function buildWorkflowEdgeRows(params: {
  versionId: string
  edges: WorkflowEdge[]
}) {
  return params.edges.map((edge) => ({
    id: edge.id,
    version_id: params.versionId,
    from_step_id: edge.sourceNodeId,
    to_step_id: edge.targetNodeId,
    branch_key: edge.branchKey === 'default' ? 'next' : edge.branchKey,
    sort_order: 0,
  }))
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

function parseContactEntryValue(entry: unknown) {
  if (typeof entry === 'string') {
    return entry.trim() || null
  }

  const record = coerceRecord(entry)
  return typeof record?.value === 'string' && record.value.trim()
    ? record.value.trim()
    : null
}

function parseConsentStatus(entry: unknown) {
  const record = coerceRecord(entry)
  const raw = typeof record?.consent_status === 'string' ? record.consent_status : null

  if (raw === 'granted' || raw === 'denied' || raw === 'unknown') {
    return raw
  }

  return typeof entry === 'string' ? 'unknown' : 'unknown'
}

export function buildWorkflowConsentSummary(
  propertyIds: string[],
  contacts: ContactLike[]
): WorkflowConsentSummary {
  const relevantContacts = contacts.filter((contact) => propertyIds.includes(contact.property_id))
  const summary: WorkflowConsentSummary = {
    sms: { granted: 0, denied: 0, unknown: 0, missingDestination: 0 },
    email: { granted: 0, denied: 0, unknown: 0, missingDestination: 0 },
  }

  const contactsByProperty = new Map<string, ContactLike[]>()
  for (const contact of relevantContacts) {
    const bucket = contactsByProperty.get(contact.property_id) || []
    bucket.push(contact)
    contactsByProperty.set(contact.property_id, bucket)
  }

  for (const propertyId of propertyIds) {
    const propertyContacts = contactsByProperty.get(propertyId) || []

    const phoneEntries = propertyContacts.flatMap((contact) => contact.phone_numbers || [])
    const emailEntries = propertyContacts.flatMap((contact) => contact.emails || [])

    const normalizedPhones = phoneEntries
      .map((entry) => ({
        value: normalizePhoneNumber(parseContactEntryValue(entry) || ''),
        consentStatus: parseConsentStatus(entry),
      }))
      .filter((entry): entry is { value: string; consentStatus: string } => Boolean(entry.value))

    const normalizedEmails = emailEntries
      .map((entry) => ({
        value: normalizeEmail(parseContactEntryValue(entry)),
        consentStatus: parseConsentStatus(entry),
      }))
      .filter((entry): entry is { value: string; consentStatus: string } => Boolean(entry.value))

    if (normalizedPhones.length === 0) {
      summary.sms.missingDestination += 1
    } else if (normalizedPhones.some((entry) => entry.consentStatus === 'granted')) {
      summary.sms.granted += 1
    } else if (normalizedPhones.some((entry) => entry.consentStatus === 'denied')) {
      summary.sms.denied += 1
    } else {
      summary.sms.unknown += 1
    }

    if (normalizedEmails.length === 0) {
      summary.email.missingDestination += 1
    } else if (normalizedEmails.some((entry) => entry.consentStatus === 'granted')) {
      summary.email.granted += 1
    } else if (normalizedEmails.some((entry) => entry.consentStatus === 'denied')) {
      summary.email.denied += 1
    } else {
      summary.email.unknown += 1
    }
  }

  return summary
}
