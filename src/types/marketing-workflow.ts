export type WorkflowLaneKey = 'logic' | 'sms' | 'email' | 'voicemail'

export type WorkflowNodeKind =
  | 'sms'
  | 'email'
  | 'voicemail'
  | 'wait'
  | 'condition'
  | 'exit'

export type WorkflowBranchKey = 'default' | 'true' | 'false'

export type WorkflowConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'greater_than'
  | 'less_than'

export type WorkflowConditionRule = {
  id: string
  field: string
  operator: WorkflowConditionOperator
  value?: string | number | boolean | null
}

export type ConditionGroup = {
  combinator: 'and' | 'or'
  rules: WorkflowConditionRule[]
}

export type WorkflowNodePosition = {
  x: number
  y: number
}

export type WorkflowNodeConfig = {
  subject?: string | null
  message?: string | null
  preview?: string | null
  templateLabel?: string | null
  templatePresetId?: string | null
  voicemailAssetId?: string | null
  voicemailAssetLabel?: string | null
  voicemailUrl?: string | null
  waitMinutes?: number | null
  waitSeconds?: number | null
  conditionGroup?: ConditionGroup | null
  exitReason?: string | null
  [key: string]: unknown
}

export type WorkflowNode = {
  id: string
  kind: WorkflowNodeKind
  laneKey: WorkflowLaneKey
  sequence: number
  label: string
  position: WorkflowNodePosition
  config: WorkflowNodeConfig
  sourceStepId?: string | null
  readOnly?: boolean
}

export type WorkflowEdge = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  branchKey: WorkflowBranchKey
  sourceStepEdgeId?: string | null
}

export type WorkflowVersion = {
  id: string
  campaignId: string
  versionNumber: number
  status: 'draft' | 'snapshot' | 'launched' | 'active' | 'completed' | 'stopped' | 'failed' | 'archived'
  launchedAt: string | null
  createdAt: string
  createdByUserId: string | null
  nodeCount: number
  edgeCount: number
  summary: {
    channel: 'sms' | 'email' | 'voice' | 'multi'
    nodeKinds: WorkflowNodeKind[]
  }
}

export type ContactRunStatus =
  | 'queued'
  | 'active'
  | 'waiting'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed'

export type ContactRun = {
  id: string
  campaignId: string
  versionId: string
  enrollmentId: string | null
  propertyId: string
  contactId: string | null
  ownerUserId: string
  status: ContactRunStatus
  stopReason: string | null
  currentNodeId: string | null
  nextDueAt: string | null
  createdAt: string
  updatedAt: string
}

export type StepRunStatus =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'stopped'

export type StepRun = {
  id: string
  campaignId: string
  versionId: string
  contactRunId: string
  nodeId: string
  status: StepRunStatus
  dueAt: string
  startedAt: string | null
  finishedAt: string | null
  attemptCount: number
  branchKey: WorkflowBranchKey | null
  idempotencyKey: string
  resultPayload: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type WorkflowDraft = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  readOnly: boolean
  convertedFromLegacy: boolean
}

export type ConsentStatusSummary = {
  granted: number
  denied: number
  unknown: number
  missingDestination: number
}

export type WorkflowConsentSummary = {
  sms: ConsentStatusSummary
  email: ConsentStatusSummary
}

export type WorkflowRouteResponse = {
  draft: WorkflowDraft
  latestVersion: WorkflowVersion | null
  consentSummary: WorkflowConsentSummary
}
