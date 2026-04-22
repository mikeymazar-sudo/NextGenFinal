'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertCircle,
  Archive,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  CircleAlert,
  FileDown,
  Inbox,
  Mail,
  MicVocal,
  MessageSquareMore,
  Phone,
  RefreshCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
  Wand2,
  XCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api/client'
import {
  MarketingWorkflowBuilder,
  type WorkflowCampaignRecord,
} from '@/components/marketing/marketing-workflow-builder'

type MarketingChannel = 'sms' | 'email' | 'voice' | 'multi'
type ReviewState = 'draft' | 'review_required' | 'approved'
type LaunchState = 'draft' | 'active' | 'partially_failed' | 'failed' | 'archived'
type ImportState = 'import_pending' | 'processing' | 'completed' | 'partial_failure' | 'failed'
type ThreadStatus =
  | 'needs_reply'
  | 'review_required'
  | 'suppressed'
  | 'failed'
  | 'replied'
  | 'voicemail_left'
  | 'sent'
  | 'delivered'

type CampaignStep = {
  id: string
  order: number
  channel: MarketingChannel
  actionType: 'sms' | 'email' | 'voicemail'
  templateLabel: string
  preview: string
  reviewState: 'ready' | 'needs_review' | 'suppressed'
  executionStatus: 'queued' | 'sent' | 'delivered' | 'voicemail_left' | 'failed' | 'suppressed'
  voicemailAssetLabel?: string
}

type Campaign = {
  id: string
  name: string
  channel: MarketingChannel
  reviewState: ReviewState
  launchState: LaunchState
  audienceSourceType: 'lead_list' | 'csv_import' | 'manual_segment'
  audienceSourceLabel: string
  audienceCount: number
  eligibleCount: number
  suppressedCount: number
  ineligibleCount: number
  launchedAt: string | null
  lastReviewAt: string
  ownerLabel: string
  nextAction: string
  reviewReasons: string[]
  draft: {
    subject: string
    message: string
    voicemailAssetLabel: string
    templatePresetId: string
    templateLabel: string
  }
  steps: CampaignStep[]
}

type ImportBatch = {
  id: string
  name: string
  sourceType: 'csv' | 'lead_list' | 'manual'
  state: ImportState
  totalRows: number
  importedRows: number
  skippedRows: number
  suppressedRows: number
  progress: number
  updatedAt: string
  issues: string[]
}

type ThreadEvent = {
  id: string
  kind: 'message' | 'note' | 'review' | 'activity'
  title: string
  detail: string
  at: string
}

type InboxThread = {
  id: string
  contactName: string
  propertyLabel: string
  campaignName: string
  channel: MarketingChannel
  status: ThreadStatus
  preview: string
  unreadCount: number
  needsReply: boolean
  reviewRequired: boolean
  suppressed: boolean
  lastEventAt: string
  events: ThreadEvent[]
}

type Analytics = {
  sent: number
  delivered: number
  replied: number
  answered: number
  voicemailLeft: number
  failed: number
  converted: number
}

type MarketingBootstrap = {
  campaigns: Campaign[]
  imports: ImportBatch[]
  threads: InboxThread[]
  analytics: Analytics
  lastSyncedAt: string
}

const channelMeta: Record<
  MarketingChannel,
  { label: string; icon: typeof MessageSquareMore; helper: string }
> = {
  sms: {
    label: 'SMS',
    icon: MessageSquareMore,
    helper: 'Text-first outreach with inbox reply handling.',
  },
  email: {
    label: 'Email',
    icon: Mail,
    helper: 'Send a review-first message with reply tracking.',
  },
  voice: {
    label: 'Voicemail',
    icon: MicVocal,
    helper: 'Leave a recorded message without live calling.',
  },
  multi: {
    label: 'Workflow',
    icon: Wand2,
    helper: 'Multi-channel workflow with shared launch ordering.',
  },
}

const importFieldMapping = [
  {
    source: 'Street address and city',
    target: 'Property match',
    detail: 'Used to decide which lead record the row belongs to and to reduce duplicate intake.',
  },
  {
    source: 'Owner name',
    target: 'Contact label',
    detail: 'Shown in the audience list, inbox, and review queue so the user sees a human-friendly name.',
  },
  {
    source: 'Phone number',
    target: 'SMS and voicemail destination',
    detail: 'Needed for text or voicemail campaigns. Missing or invalid phone data makes the row ineligible for phone channels.',
  },
  {
    source: 'Email address',
    target: 'Email destination',
    detail: 'If present and valid, the row can be used in cold email campaigns.',
  },
  {
    source: 'Suppression and ownership checks',
    target: 'Eligibility status',
    detail: 'Opt-outs, blocked destinations, and ownership mismatches override the raw import before launch.',
  },
] as const

const reviewStateMeta: Record<
  ReviewState,
  { label: string; className: string }
> = {
  draft: { label: 'Draft', className: 'border-border bg-background text-foreground' },
  review_required: {
    label: 'Review required',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  approved: {
    label: 'Approved',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
}

const launchStateMeta: Record<
  LaunchState,
  { label: string; className: string }
> = {
  draft: { label: 'Not launched', className: 'border-border bg-background text-foreground' },
  active: {
    label: 'Launched',
    className:
      'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  },
  partially_failed: {
    label: 'Partial failure',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  failed: {
    label: 'Failed',
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  },
  archived: {
    label: 'Archived',
    className: 'border-border bg-muted text-muted-foreground',
  },
}

const importStateMeta: Record<
  ImportState,
  { label: string; className: string }
> = {
  import_pending: {
    label: 'Import pending',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  processing: {
    label: 'Importing',
    className:
      'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  },
  completed: {
    label: 'Ready',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  partial_failure: {
    label: 'Partial failure',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  failed: {
    label: 'Failed',
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  },
}

const threadStatusMeta: Record<
  ThreadStatus,
  { label: string; className: string }
> = {
  needs_reply: {
    label: 'Needs reply',
    className:
      'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  },
  review_required: {
    label: 'Review required',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  },
  suppressed: {
    label: 'Suppressed',
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  },
  failed: {
    label: 'Failed',
    className:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  },
  replied: {
    label: 'Replied',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  voicemail_left: {
    label: 'Voicemail left',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  sent: {
    label: 'Sent',
    className: 'border-border bg-background text-foreground',
  },
  delivered: {
    label: 'Delivered',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
}

function createDemoBootstrap(): MarketingBootstrap {
  return {
    campaigns: [
      {
        id: 'camp-001',
        name: 'Spring seller follow-up',
        channel: 'sms',
        reviewState: 'review_required',
        launchState: 'draft',
        audienceSourceType: 'lead_list',
        audienceSourceLabel: 'County hot sheet',
        audienceCount: 184,
        eligibleCount: 169,
        suppressedCount: 11,
        ineligibleCount: 4,
        launchedAt: null,
        lastReviewAt: '2026-04-19T15:20:00.000Z',
        ownerLabel: 'Michael',
        nextAction: 'Resolve suppressed destinations and re-run review.',
        reviewReasons: [
          '11 recipients are globally suppressed for SMS.',
          '4 rows are missing a valid destination.',
        ],
        draft: {
          subject: 'Quick question about 1223 Palm St',
          message:
            'Hi Ava, this is Michael. I am reaching out to see whether you would ever consider an offer on 1223 Palm St. No pressure at all, I just wanted to ask.',
          voicemailAssetLabel: 'None',
          templatePresetId: 'sms-owner-intro',
          templateLabel: 'Owner intro text',
        },
        steps: [
          {
            id: 'step-001',
            order: 1,
            channel: 'sms',
            actionType: 'sms',
            templateLabel: 'Intro text',
            preview: 'Hi, it is Michael with a quick market update for you.',
            reviewState: 'needs_review',
            executionStatus: 'queued',
          },
          {
            id: 'step-002',
            order: 2,
            channel: 'email',
            actionType: 'email',
            templateLabel: 'Follow-up email',
            preview: 'Subject: Quick check-in',
            reviewState: 'ready',
            executionStatus: 'queued',
          },
        ],
      },
      {
        id: 'camp-002',
        name: 'Voicemail reactivation',
        channel: 'voice',
        reviewState: 'approved',
        launchState: 'partially_failed',
        audienceSourceType: 'csv_import',
        audienceSourceLabel: 'June neighborhood list',
        audienceCount: 92,
        eligibleCount: 85,
        suppressedCount: 5,
        ineligibleCount: 2,
        launchedAt: '2026-04-18T16:05:00.000Z',
        lastReviewAt: '2026-04-18T14:45:00.000Z',
        ownerLabel: 'Michael',
        nextAction: 'Review the 7 skipped recipients and retry the failed rows.',
        reviewReasons: [
          'Voicemail asset is present and playable.',
          '5 destinations are suppressed and 2 are invalid.',
        ],
        draft: {
          subject: 'Voicemail drop',
          message:
            'Hi, this is a quick recorded update about a new listing opportunity. I left a voicemail with the key details.',
          voicemailAssetLabel: 'Neighborhood update v2',
          templatePresetId: '',
          templateLabel: 'Neighborhood update',
        },
        steps: [
          {
            id: 'step-003',
            order: 1,
            channel: 'voice',
            actionType: 'voicemail',
            templateLabel: 'Neighborhood update',
            preview: 'Recorded voicemail drop using Neighborhood update v2.',
            reviewState: 'ready',
            executionStatus: 'voicemail_left',
            voicemailAssetLabel: 'Neighborhood update v2',
          },
          {
            id: 'step-004',
            order: 2,
            channel: 'sms',
            actionType: 'sms',
            templateLabel: 'Reply prompt',
            preview: 'Text back if you want a market recap.',
            reviewState: 'suppressed',
            executionStatus: 'suppressed',
          },
        ],
      },
      {
        id: 'camp-003',
        name: 'Open house email',
        channel: 'email',
        reviewState: 'approved',
        launchState: 'active',
        audienceSourceType: 'manual_segment',
        audienceSourceLabel: 'Open house attendees',
        audienceCount: 210,
        eligibleCount: 203,
        suppressedCount: 4,
        ineligibleCount: 3,
        launchedAt: '2026-04-16T13:35:00.000Z',
        lastReviewAt: '2026-04-16T12:10:00.000Z',
        ownerLabel: 'Michael',
        nextAction: 'Watch replies and follow up on the hottest prospects.',
        reviewReasons: ['Sender identity and reply-to are verified.'],
        draft: {
          subject: 'Would you consider an as-is offer on 11 Maple Ct?',
          message:
            'Hi Courtney,\n\nI wanted to reach out and ask whether you would ever consider an as-is offer on 11 Maple Ct. I work with owners who want a straightforward sale without repairs, listings, or drawn-out timelines.\n\nIf you are open to it, I can send over a simple range and next steps.\n\nBest,\nMichael',
          voicemailAssetLabel: 'None',
          templatePresetId: 'email-as-is-offer',
          templateLabel: 'As-is offer email',
        },
        steps: [
          {
            id: 'step-005',
            order: 1,
            channel: 'email',
            actionType: 'email',
            templateLabel: 'Open house recap',
            preview: 'Thanks for stopping by the open house.',
            reviewState: 'ready',
            executionStatus: 'delivered',
          },
        ],
      },
      {
        id: 'camp-004',
        name: 'Price reduction draft',
        channel: 'sms',
        reviewState: 'draft',
        launchState: 'draft',
        audienceSourceType: 'lead_list',
        audienceSourceLabel: 'Hot leads - 7 day window',
        audienceCount: 63,
        eligibleCount: 63,
        suppressedCount: 0,
        ineligibleCount: 0,
        launchedAt: null,
        lastReviewAt: '2026-04-20T10:05:00.000Z',
        ownerLabel: 'Michael',
        nextAction: 'Write copy, then run the eligibility review.',
        reviewReasons: ['Draft not yet reviewed.'],
        draft: {
          subject: 'Following up on 18 Cypress Ln',
          message:
            'Hi Bri, following up in case my earlier note got buried. If selling 18 Cypress Ln is not on your radar, no worries. If it is, I would be happy to share what a simple cash offer could look like.',
          voicemailAssetLabel: 'None',
          templatePresetId: 'sms-gentle-follow-up',
          templateLabel: 'Gentle follow-up',
        },
        steps: [
          {
            id: 'step-006',
            order: 1,
            channel: 'sms',
            actionType: 'sms',
            templateLabel: 'Price drop intro',
            preview: 'Quick pricing update for you.',
            reviewState: 'needs_review',
            executionStatus: 'queued',
          },
        ],
      },
    ],
    imports: [
      {
        id: 'imp-001',
        name: 'June neighborhood list.csv',
        sourceType: 'csv',
        state: 'processing',
        totalRows: 124,
        importedRows: 76,
        skippedRows: 8,
        suppressedRows: 4,
        progress: 61,
        updatedAt: '2026-04-21T14:30:00.000Z',
        issues: ['18 rows still need destination cleanup.'],
      },
      {
        id: 'imp-002',
        name: 'Open house sign-ins.csv',
        sourceType: 'csv',
        state: 'import_pending',
        totalRows: 58,
        importedRows: 0,
        skippedRows: 0,
        suppressedRows: 0,
        progress: 14,
        updatedAt: '2026-04-21T13:05:00.000Z',
        issues: ['Waiting on duplicate check to finish.'],
      },
      {
        id: 'imp-003',
        name: 'Quarterly nurture list.csv',
        sourceType: 'csv',
        state: 'partial_failure',
        totalRows: 208,
        importedRows: 182,
        skippedRows: 14,
        suppressedRows: 12,
        progress: 100,
        updatedAt: '2026-04-20T19:10:00.000Z',
        issues: ['14 rows were invalid and 12 were suppressed.'],
      },
    ],
    threads: [
      {
        id: 'thr-001',
        contactName: 'Ava Rivera',
        propertyLabel: '1223 Palm St',
        campaignName: 'Spring seller follow-up',
        channel: 'sms',
        status: 'needs_reply',
        preview: 'Thanks for the update. Can we talk tomorrow afternoon?',
        unreadCount: 2,
        needsReply: true,
        reviewRequired: false,
        suppressed: false,
        lastEventAt: '2026-04-21T15:15:00.000Z',
        events: [
          {
            id: 'evt-001',
            kind: 'message',
            title: 'Inbound SMS',
            detail: 'Thanks for the update. Can we talk tomorrow afternoon?',
            at: '2026-04-21T15:15:00.000Z',
          },
          {
            id: 'evt-002',
            kind: 'message',
            title: 'Outbound SMS',
            detail: 'Shared the market recap and asked if a quick check-in would help.',
            at: '2026-04-21T15:06:00.000Z',
          },
          {
            id: 'evt-003',
            kind: 'note',
            title: 'Follow-up note',
            detail: 'Owner asked for a call after lunch.',
            at: '2026-04-21T15:02:00.000Z',
          },
        ],
      },
      {
        id: 'thr-002',
        contactName: 'Marcus Chen',
        propertyLabel: '44 Westview Ave',
        campaignName: 'Open house email',
        channel: 'email',
        status: 'review_required',
        preview: 'This reply bounced because the inbox is on hold.',
        unreadCount: 1,
        needsReply: false,
        reviewRequired: true,
        suppressed: false,
        lastEventAt: '2026-04-21T13:20:00.000Z',
        events: [
          {
            id: 'evt-004',
            kind: 'review',
            title: 'Review flagged',
            detail: 'Reply needs a quick ownership check before sending again.',
            at: '2026-04-21T13:20:00.000Z',
          },
          {
            id: 'evt-005',
            kind: 'message',
            title: 'Inbound email',
            detail: 'Can you send the floor plan again?',
            at: '2026-04-21T13:18:00.000Z',
          },
        ],
      },
      {
        id: 'thr-003',
        contactName: 'Lena Torres',
        propertyLabel: '908 Harbor Dr',
        campaignName: 'Voicemail reactivation',
        channel: 'voice',
        status: 'suppressed',
        preview: 'This number is globally suppressed for voice.',
        unreadCount: 0,
        needsReply: false,
        reviewRequired: false,
        suppressed: true,
        lastEventAt: '2026-04-20T16:42:00.000Z',
        events: [
          {
            id: 'evt-006',
            kind: 'activity',
            title: 'Suppression matched',
            detail: 'Voice outreach is blocked because the destination is suppressed.',
            at: '2026-04-20T16:42:00.000Z',
          },
          {
            id: 'evt-007',
            kind: 'message',
            title: 'Voicemail left',
            detail: 'Recorded voicemail delivered before the suppression flag was resolved.',
            at: '2026-04-20T16:18:00.000Z',
          },
        ],
      },
      {
        id: 'thr-004',
        contactName: 'Bri Patel',
        propertyLabel: '18 Cypress Ln',
        campaignName: 'Price reduction draft',
        channel: 'sms',
        status: 'failed',
        preview: 'Delivery failed because the number is invalid.',
        unreadCount: 0,
        needsReply: false,
        reviewRequired: false,
        suppressed: false,
        lastEventAt: '2026-04-20T11:32:00.000Z',
        events: [
          {
            id: 'evt-008',
            kind: 'activity',
            title: 'Delivery failed',
            detail: 'SMS could not be delivered because the destination was invalid.',
            at: '2026-04-20T11:32:00.000Z',
          },
          {
            id: 'evt-009',
            kind: 'message',
            title: 'Queued SMS',
            detail: 'Attempted the initial text with the price reduction note.',
            at: '2026-04-20T11:30:00.000Z',
          },
        ],
      },
      {
        id: 'thr-005',
        contactName: 'Courtney Johnson',
        propertyLabel: '11 Maple Ct',
        campaignName: 'Open house email',
        channel: 'email',
        status: 'replied',
        preview: 'Thanks. The recap was exactly what I needed.',
        unreadCount: 0,
        needsReply: false,
        reviewRequired: false,
        suppressed: false,
        lastEventAt: '2026-04-19T18:10:00.000Z',
        events: [
          {
            id: 'evt-010',
            kind: 'message',
            title: 'Inbound reply',
            detail: 'Thanks. The recap was exactly what I needed.',
            at: '2026-04-19T18:10:00.000Z',
          },
          {
            id: 'evt-011',
            kind: 'message',
            title: 'Outbound email',
            detail: 'Sent the open house recap and next-step summary.',
            at: '2026-04-19T16:45:00.000Z',
          },
        ],
      },
    ],
    analytics: {
      sent: 458,
      delivered: 421,
      replied: 58,
      answered: 21,
      voicemailLeft: 34,
      failed: 19,
      converted: 12,
    },
    lastSyncedAt: '2026-04-21T15:20:00.000Z',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeAnalytics(value: unknown, campaigns: Campaign[], threads: InboxThread[]): Analytics {
  const computed = computeAnalytics(campaigns, threads)
  if (!isRecord(value)) return computed
  return {
    sent: Number(value.sent ?? value.sentCount ?? computed.sent),
    delivered: Number(value.delivered ?? value.deliveredCount ?? computed.delivered),
    replied: Number(value.replied ?? value.repliedCount ?? computed.replied),
    answered: Number(value.answered ?? value.answeredCount ?? computed.answered),
    voicemailLeft: Number(value.voicemailLeft ?? value.voicemail_left ?? computed.voicemailLeft),
    failed: Number(value.failed ?? value.failedCount ?? computed.failed),
    converted: Number(value.converted ?? value.convertedCount ?? computed.converted),
  }
}

function normalizeBootstrap(raw: unknown): MarketingBootstrap {
  const source: Record<string, unknown> = isRecord(raw)
    ? (isRecord(raw.data) ? raw.data : raw)
    : {}
  const campaigns = Array.isArray(source.campaigns) ? (source.campaigns as Campaign[]) : []
  const imports = Array.isArray(source.imports) ? (source.imports as ImportBatch[]) : []
  const threads = Array.isArray(source.threads) ? (source.threads as InboxThread[]) : []
  const analytics = normalizeAnalytics(source.analytics ?? source.analyticsSummary, campaigns, threads)
  const lastSyncedAt =
    typeof source.lastSyncedAt === 'string'
      ? source.lastSyncedAt
      : new Date().toISOString()

  return {
    campaigns,
    imports,
    threads,
    analytics,
    lastSyncedAt,
  }
}

function computeAnalytics(campaigns: Campaign[], threads: InboxThread[]): Analytics {
  return {
    sent: threads.filter((thread) => thread.status === 'sent').length + campaigns.filter((campaign) => campaign.launchState === 'active').length,
    delivered: threads.filter((thread) => thread.status === 'delivered').length,
    replied: threads.filter((thread) => thread.status === 'replied').length,
    answered: threads.filter((thread) => thread.status === 'voicemail_left').length,
    voicemailLeft: campaigns.filter((campaign) => campaign.channel === 'voice' && campaign.launchState === 'active').length,
    failed:
      threads.filter((thread) => thread.status === 'failed').length +
      campaigns.filter((campaign) => campaign.launchState === 'failed' || campaign.launchState === 'partially_failed').length,
    converted: threads.filter((thread) => thread.status === 'replied').length,
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatTime(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

function getChannelBadge(channel: MarketingChannel) {
  const meta = channelMeta[channel]
  const Icon = meta.icon
  return (
    <Badge variant="outline" className="gap-1.5">
      <Icon className="size-3.5" />
      {meta.label}
    </Badge>
  )
}

function getStateBadge(value: string) {
  if (value in reviewStateMeta) {
    const meta = reviewStateMeta[value as ReviewState]
    return <Badge variant="outline" className={cn(meta.className)}>{meta.label}</Badge>
  }
  if (value in launchStateMeta) {
    const meta = launchStateMeta[value as LaunchState]
    return <Badge variant="outline" className={cn(meta.className)}>{meta.label}</Badge>
  }
  if (value in importStateMeta) {
    const meta = importStateMeta[value as ImportState]
    return <Badge variant="outline" className={cn(meta.className)}>{meta.label}</Badge>
  }
  if (value in threadStatusMeta) {
    const meta = threadStatusMeta[value as ThreadStatus]
    return <Badge variant="outline" className={cn(meta.className)}>{meta.label}</Badge>
  }

  return <Badge variant="outline">{value}</Badge>
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: typeof BarChart3
}) {
  return (
    <div className="rounded-xl border bg-background/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-full border bg-muted p-2 text-muted-foreground">
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: typeof Inbox
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-background shadow-sm">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {actionLabel ? (
        <Button className="mt-4" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

function LoadingShell() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-background p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-[min(42rem,100%)]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>

      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[32rem] rounded-2xl" />
        <Skeleton className="h-[32rem] rounded-2xl" />
      </div>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function MarketingCommandCenter() {
  const [loading, setLoading] = useState(true)
  const [bootstrap, setBootstrap] = useState<MarketingBootstrap>(createDemoBootstrap)
  const [activeTab, setActiveTab] = useState('builder')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<'launch' | 'suppress' | null>(null)
  const [pendingAction, setPendingAction] = useState<'refresh' | 'review' | 'launch' | 'suppress' | null>(null)

  const loadBootstrap = useCallback(async () => {
    setLoading(true)

    try {
      const response = await api.getMarketingCommandCenter()
      if (response.error || !response.data) {
        throw new Error(response.error || 'Failed to load marketing command center')
      }
      setBootstrap(normalizeBootstrap(response.data))
    } catch {
      setBootstrap(createDemoBootstrap())
    } finally {
      setLoading(false)
    }
  }, [])

  const hydrateCampaignWorkflow = useCallback(async (campaignId: string) => {
    const response = await api.getMarketingWorkflow(campaignId)
    if (response.error || !response.data) {
      return
    }

    const deriveWorkflowChannel = (nodes: Array<{ kind?: string }> = []) => {
      const deliveryKinds = Array.from(
        new Set(
          nodes
            .map((node) => node.kind)
            .filter((kind): kind is string => kind === 'sms' || kind === 'email' || kind === 'voicemail')
        )
      )

      if (deliveryKinds.length > 1) return 'multi'
      if (deliveryKinds[0] === 'email') return 'email'
      if (deliveryKinds[0] === 'voicemail') return 'voice'
      return 'sms'
    }

    setBootstrap((current) => ({
      ...current,
      campaigns: current.campaigns.map((campaign) =>
        campaign.id === campaignId
          ? {
              ...campaign,
              channel: deriveWorkflowChannel(response.data?.draft?.nodes || []),
              workflow: response.data?.draft,
              workflowVersion: response.data?.latestVersion,
              consentSummary: response.data?.consentSummary,
              convertedLegacyFlow: response.data?.draft?.convertedFromLegacy || false,
              readOnlyWorkflow: response.data?.draft?.readOnly || false,
            }
          : campaign
      ),
    }))
  }, [])

  const persistWorkflow = useCallback(async (payload: {
    campaignId: string
    nodes: Array<{
      id: string
      kind: 'sms' | 'email' | 'voicemail' | 'wait' | 'condition' | 'exit'
      laneKey: 'logic' | 'sms' | 'email' | 'voicemail'
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
  }) => {
    const response = await api.updateMarketingWorkflow(payload.campaignId, {
      nodes: payload.nodes,
      edges: payload.edges,
    })

    if (response.error) {
      throw new Error(response.error)
    }

    await hydrateCampaignWorkflow(payload.campaignId)
  }, [hydrateCampaignWorkflow])

  useEffect(() => {
    void loadBootstrap()
  }, [loadBootstrap])

  useEffect(() => {
    if (!selectedCampaignId && bootstrap.campaigns.length > 0) {
      setSelectedCampaignId(
        bootstrap.campaigns.find((campaign) => campaign.reviewState === 'review_required')?.id ??
          bootstrap.campaigns[0].id
      )
    }
  }, [bootstrap.campaigns, selectedCampaignId])

  useEffect(() => {
    if (!selectedCampaignId) return
    void hydrateCampaignWorkflow(selectedCampaignId)
  }, [hydrateCampaignWorkflow, selectedCampaignId])

  useEffect(() => {
    if (!selectedImportId && bootstrap.imports.length > 0) {
      setSelectedImportId(bootstrap.imports[0].id)
    }
  }, [bootstrap.imports, selectedImportId])

  useEffect(() => {
    if (!selectedThreadId && bootstrap.threads.length > 0) {
      setSelectedThreadId(
        bootstrap.threads.find((thread) => thread.needsReply)?.id ?? bootstrap.threads[0].id
      )
    }
  }, [bootstrap.threads, selectedThreadId])

  const campaigns = bootstrap.campaigns
  const imports = bootstrap.imports
  const threads = bootstrap.threads

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null
  const selectedImport =
    imports.find((batch) => batch.id === selectedImportId) ?? imports[0] ?? null
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null

  const analytics = useMemo(
    () => normalizeAnalytics(bootstrap.analytics, campaigns, threads),
    [bootstrap.analytics, campaigns, threads]
  )

  const reviewQueueCount = campaigns.filter(
    (campaign) => campaign.reviewState === 'draft' || campaign.reviewState === 'review_required'
  ).length
  const pendingImports = imports.filter((batch) => batch.state === 'import_pending' || batch.state === 'processing').length
  const replyQueueCount = threads.filter((thread) => thread.needsReply).length
  const launchedCount = campaigns.filter(
    (campaign) => campaign.launchState === 'active' || campaign.launchState === 'partially_failed'
  ).length
  const partialFailureCount = campaigns.filter(
    (campaign) => campaign.launchState === 'partially_failed'
  ).length

  const isCampaignReadOnly =
    selectedCampaign?.launchState === 'active' ||
    selectedCampaign?.launchState === 'partially_failed' ||
    selectedCampaign?.launchState === 'failed'

  const canLaunch =
    Boolean(selectedCampaign) &&
    selectedCampaign.reviewState === 'approved' &&
    !isCampaignReadOnly

  const refresh = useCallback(() => {
    setPendingAction('refresh')
    void loadBootstrap().finally(() => setPendingAction(null))
  }, [loadBootstrap])

  const runReview = async () => {
    if (!selectedCampaign || isCampaignReadOnly) return

    setPendingAction('review')
    const response = await api.reviewMarketingCampaign(selectedCampaign.id)

    if (response.error) {
      toast.error(response.error)
      setPendingAction(null)
      return
    }

    toast.success('Review updated')
    await loadBootstrap()
    setPendingAction(null)
  }

  const openLaunchDialog = () => {
    if (!canLaunch) return
    setDialogMode('launch')
  }

  const openSuppressDialog = () => {
    if (!selectedThread || selectedThread.suppressed) return
    setDialogMode('suppress')
  }

  const confirmDialog = async () => {
    if (dialogMode === 'launch' && selectedCampaign) {
      setPendingAction('launch')
      const response = await api.launchMarketingCampaign(selectedCampaign.id)

      if (response.error) {
        toast.error(response.error)
        setPendingAction(null)
        return
      }

      toast.success('Campaign queued for launch')
      await loadBootstrap()
      setPendingAction(null)
    }

    if (dialogMode === 'suppress' && selectedThread) {
      setPendingAction('suppress')
      setBootstrap((current) => ({
        ...current,
        threads: current.threads.map((thread) =>
          thread.id === selectedThread.id
            ? {
                ...thread,
                suppressed: true,
                needsReply: false,
                reviewRequired: false,
                status: 'suppressed',
                preview: 'This destination is now globally suppressed.',
                events: [
                  {
                    id: `evt-${Date.now()}`,
                    kind: 'activity',
                    title: 'Suppressed destination',
                    detail: 'A manual suppression was applied from the inbox.',
                    at: new Date().toISOString(),
                  },
                  ...thread.events,
                ],
              }
            : thread
        ),
      }))
      toast.success('Destination suppressed locally')
      setPendingAction(null)
    }

    setDialogMode(null)
  }

  if (loading) {
    return <LoadingShell />
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-white via-slate-50 to-sky-50 p-6 shadow-sm dark:from-zinc-950 dark:via-zinc-950 dark:to-sky-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="w-fit gap-1.5">
              <Sparkles className="size-3.5" />
              Marketing command center
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Marketing</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Configure review-first campaigns across SMS, email, and recorded voicemail, manage imports, work the inbox, and keep launch outcomes visible in analytics.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refresh}>
              <RefreshCcw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setActiveTab('audience')
              }}
            >
              <Upload className="mr-2 size-4" />
              Import CSV
            </Button>
            <Button
              onClick={() => {
                setActiveTab('builder')
                const draftCampaign = campaigns.find((campaign) => campaign.reviewState === 'draft') ?? campaigns[0]
                if (draftCampaign) {
                  setSelectedCampaignId(draftCampaign.id)
                }
              }}
            >
              <Wand2 className="mr-2 size-4" />
              New campaign
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Review queue"
            value={formatNumber(reviewQueueCount)}
            detail="Draft and review-required campaigns need attention."
            icon={ShieldAlert}
          />
          <StatTile
            label="Imports pending"
            value={formatNumber(pendingImports)}
            detail="CSV batches still converting into usable audiences."
            icon={FileDown}
          />
          <StatTile
            label="Inbox replies"
            value={formatNumber(replyQueueCount)}
            detail="Threads that still need a response."
            icon={Inbox}
          />
          <StatTile
            label="Launched"
            value={formatNumber(launchedCount)}
            detail="Active campaigns already out in the wild."
            icon={Send}
          />
          <StatTile
            label="Partial failure"
            value={formatNumber(partialFailureCount)}
            detail="Campaigns with a mixed launch result."
            icon={AlertCircle}
          />
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="audience">Audience / Imports</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-6">
          <SectionHeader
            eyebrow="Builder"
            title="Workflow canvas"
            description="Build a fixed-lane workflow, keep the global execution order visible, and inspect the launch preview before review or launch."
            actions={
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    void runReview()
                  }}
                  disabled={!selectedCampaign || isCampaignReadOnly || pendingAction !== null}
                >
                  Run review
                </Button>
                <Button onClick={openLaunchDialog} disabled={!canLaunch || pendingAction !== null}>
                  Launch campaign
                </Button>
              </>
            }
          />

          <MarketingWorkflowBuilder
            campaigns={campaigns as WorkflowCampaignRecord[]}
            selectedCampaignId={selectedCampaignId}
            onSelectCampaign={setSelectedCampaignId}
            onSaveWorkflow={persistWorkflow}
          />
        </TabsContent>

        <TabsContent value="audience" className="space-y-6">
          <SectionHeader
            eyebrow="Audience and imports"
            title="Convert raw rows into campaign-ready audiences"
            description="CSV batches, lead lists, and manual segments all show their import state, suppression hits, and unresolved rows."
            actions={
              <Button variant="outline" onClick={() => setActiveTab('builder')}>
                <ArrowRight className="mr-2 size-4" />
                Back to builder
              </Button>
            }
          />

          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Import batches</CardTitle>
                <CardDescription>
                  Watch each batch move from pending to usable audience rows.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {imports.length === 0 ? (
                  <EmptyState
                    icon={Upload}
                    title="No import batches yet"
                    description="Upload a CSV to start converting rows into campaign audiences."
                    actionLabel="Upload CSV"
                  />
                ) : (
                  <ScrollArea className="h-[28rem] pr-4">
                    <div className="space-y-3">
                      {imports.map((batch) => (
                        <button
                          key={batch.id}
                          type="button"
                          onClick={() => setSelectedImportId(batch.id)}
                          className={cn(
                            'w-full rounded-2xl border p-4 text-left transition-colors',
                            batch.id === selectedImport?.id
                              ? 'border-sky-300 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/20'
                              : 'bg-background hover:bg-muted/50'
                          )}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <FileDown className="size-4 text-muted-foreground" />
                                <p className="text-sm font-medium">{batch.name}</p>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {batch.sourceType === 'csv' ? 'CSV import' : batch.sourceType === 'lead_list' ? 'Lead list' : 'Manual segment'}
                                {' '}
                                · Updated {formatTime(batch.updatedAt)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {getStateBadge(batch.state)}
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Progress</span>
                              <span>{batch.progress}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-2 rounded-full',
                                  batch.state === 'failed'
                                    ? 'bg-red-500'
                                    : batch.state === 'partial_failure'
                                      ? 'bg-amber-500'
                                      : 'bg-sky-500'
                                )}
                                style={{ width: `${Math.max(8, Math.min(batch.progress, 100))}%` }}
                              />
                            </div>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-4">
                            <div className="rounded-xl border bg-muted/20 p-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                              <p className="text-sm font-semibold">{formatNumber(batch.totalRows)}</p>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Imported</p>
                              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                {formatNumber(batch.importedRows)}
                              </p>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Skipped</p>
                              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                {formatNumber(batch.skippedRows)}
                              </p>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Suppressed</p>
                              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                                {formatNumber(batch.suppressedRows)}
                              </p>
                            </div>
                          </div>

                          {batch.issues.length > 0 ? (
                            <div className="mt-4 rounded-xl border border-dashed bg-muted/20 p-3">
                              <p className="text-sm font-medium">Review notes</p>
                              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                {batch.issues.map((issue) => (
                                  <li key={issue} className="flex items-start gap-2">
                                    <CircleAlert className="mt-0.5 size-3.5 text-amber-600" />
                                    <span>{issue}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Audience readiness</CardTitle>
                <CardDescription>
                  Campaign audiences are usable only after suppression, eligibility, and ownership checks pass.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Lead lists</p>
                    <p className="mt-2 text-2xl font-semibold">{formatNumber(campaigns.filter((campaign) => campaign.audienceSourceType === 'lead_list').length)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Campaigns seeded from saved lead lists.</p>
                  </div>
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">CSV imports</p>
                    <p className="mt-2 text-2xl font-semibold">{formatNumber(imports.filter((batch) => batch.sourceType === 'csv').length)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Batches waiting to become campaign-ready rows.</p>
                  </div>
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Suppressed rows</p>
                    <p className="mt-2 text-2xl font-semibold text-red-700 dark:text-red-300">
                      {formatNumber(campaigns.reduce((total, campaign) => total + campaign.suppressedCount, 0))}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Blocked destinations across all active campaigns.</p>
                  </div>
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Eligible rows</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatNumber(campaigns.reduce((total, campaign) => total + campaign.eligibleCount, 0))}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Rows ready to move into the queue.</p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Visual mapping</p>
                      <p className="text-xs text-muted-foreground">
                        Follow how a raw row becomes a campaign-ready contact without reading technical field names.
                      </p>
                    </div>
                    {selectedImport ? <Badge variant="outline">{selectedImport.name}</Badge> : null}
                  </div>

                  {selectedImport ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 lg:grid-cols-4">
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">1. Intake</p>
                          <p className="mt-2 text-sm font-medium">{formatNumber(selectedImport.totalRows)} raw rows</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            The import brings in addresses, owners, and contact data from the selected source.
                          </p>
                        </div>
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">2. Mapping</p>
                          <p className="mt-2 text-sm font-medium">{formatNumber(selectedImport.importedRows)} mapped rows</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Names, addresses, phones, and emails are matched into the campaign audience model.
                          </p>
                        </div>
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">3. Eligibility</p>
                          <p className="mt-2 text-sm font-medium">{formatNumber(selectedImport.skippedRows + selectedImport.suppressedRows)} flagged rows</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Suppression hits and missing destinations are marked before the user can launch anything.
                          </p>
                        </div>
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">4. Ready queue</p>
                          <p className="mt-2 text-sm font-medium">{formatNumber(selectedImport.importedRows)} audience rows</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Once review passes, only the clean rows move forward into launchable campaigns.
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="text-sm font-medium">Field mapping in plain English</p>
                        <div className="mt-3 space-y-2">
                          {importFieldMapping.map((mapping) => (
                            <div key={mapping.source} className="flex flex-col gap-2 rounded-xl border bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{mapping.source}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{mapping.detail}</p>
                              </div>
                              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <ArrowRight className="size-4" />
                                <span>{mapping.target}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={Upload}
                      title="Choose an import"
                      description="Select a batch on the left to see how its rows are mapped into the audience model."
                    />
                  )}
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Audience conversion rules</p>
                      <p className="text-xs text-muted-foreground">
                        Imported rows become usable leads only after duplicate, suppression, and destination checks pass.
                      </p>
                    </div>
                    <Badge variant="outline">Review-first</Badge>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="rounded-xl border bg-background p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-emerald-600" />
                        <p className="text-sm font-medium">Good rows</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Clean rows can be added to campaigns immediately after review.
                      </p>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="size-4 text-amber-600" />
                        <p className="text-sm font-medium">Suppressed rows</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Suppressed destinations stay blocked until a manual resolution happens.
                      </p>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <div className="flex items-center gap-2">
                        <XCircle className="size-4 text-red-600" />
                        <p className="text-sm font-medium">Incomplete rows</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Missing or invalid destinations stay out of launchable audiences.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inbox" className="space-y-6">
          <SectionHeader
            eyebrow="Unified inbox"
            title="Work the queue, then inspect the thread"
            description="SMS and email are replyable. Voice and voicemail are review-only, and every thread keeps its own chronological activity trail."
            actions={
              <Button variant="outline" onClick={() => setActiveTab('analytics')}>
                <BarChart3 className="mr-2 size-4" />
                Jump to analytics
              </Button>
            }
          />

          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Thread queue</CardTitle>
                <CardDescription>Prioritize replies, failed delivery, review flags, and suppressed numbers.</CardDescription>
              </CardHeader>
              <CardContent>
                {threads.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="Inbox is quiet"
                    description="When campaigns go live, the next reply or review item will show up here."
                    actionLabel="Back to builder"
                    onAction={() => setActiveTab('builder')}
                  />
                ) : (
                  <ScrollArea className="h-[32rem] pr-4">
                    <div className="space-y-3">
                      {threads.map((thread) => {
                        const active = thread.id === selectedThread?.id
                        const ChannelIcon = channelMeta[thread.channel].icon
                        return (
                          <button
                            key={thread.id}
                            type="button"
                            onClick={() => {
                              setSelectedThreadId(thread.id)
                              setActiveTab('inbox')
                            }}
                            className={cn(
                              'w-full rounded-2xl border p-4 text-left transition-colors',
                              active
                                ? 'border-sky-300 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/20'
                                : 'bg-background hover:bg-muted/50'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <ChannelIcon className="size-4 text-muted-foreground" />
                                  <p className="text-sm font-medium">{thread.contactName}</p>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{thread.propertyLabel}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">{getStateBadge(thread.status)}</div>
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground">{thread.preview}</p>
                            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{thread.campaignName}</span>
                              <span>{formatTime(thread.lastEventAt)}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Thread detail</CardTitle>
                    <CardDescription>Read the full timeline, then decide whether to reply, handle, or suppress.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedThread ? getChannelBadge(selectedThread.channel) : null}
                    {selectedThread ? getStateBadge(selectedThread.status) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedThread ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-base font-semibold">{selectedThread.contactName}</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedThread.propertyLabel} · {selectedThread.campaignName}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">Unread {formatNumber(selectedThread.unreadCount)}</Badge>
                          {selectedThread.reviewRequired ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">Review required</Badge> : null}
                          {selectedThread.suppressed ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">Suppressed</Badge> : null}
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{selectedThread.preview}</p>
                    </div>

                    <div className="rounded-2xl border bg-background p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Chronological activity</p>
                          <p className="text-xs text-muted-foreground">Messages, notes, review flags, and status updates stay in time order.</p>
                        </div>
                        <Badge variant="outline">{selectedThread.events.length} events</Badge>
                      </div>
                      <div className="mt-4 space-y-4">
                        {selectedThread.events.map((event) => (
                          <div key={event.id} className="flex gap-3">
                            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                              {event.kind === 'message' ? (
                                <Send className="size-3.5 text-muted-foreground" />
                              ) : event.kind === 'review' ? (
                                <ShieldAlert className="size-3.5 text-amber-600" />
                              ) : event.kind === 'note' ? (
                                <Archive className="size-3.5 text-muted-foreground" />
                              ) : (
                                <Clock3 className="size-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 border-l border-dashed pl-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium">{event.title}</p>
                                <span className="text-xs text-muted-foreground">{formatTime(event.at)}</span>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={selectedThread.channel === 'voice' || selectedThread.suppressed}
                      >
                        {selectedThread.channel === 'voice' ? 'Review only' : 'Reply in inbox'}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={selectedThread.channel === 'voice' || selectedThread.suppressed}
                      >
                        Mark handled
                      </Button>
                      <Button variant="destructive" onClick={openSuppressDialog} disabled={selectedThread.suppressed}>
                        Suppress destination
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {selectedThread.channel === 'voice'
                        ? 'Voice and voicemail threads stay review-only in marketing.'
                        : selectedThread.suppressed
                          ? 'This destination is suppressed, so reply actions are disabled.'
                          : 'Replyable channels stay in the inbox until the thread is handled.'}
                    </p>
                  </div>
                ) : (
                  <EmptyState
                    icon={Inbox}
                    title="Select a thread"
                    description="The right pane will show the message history, status, and next action."
                    actionLabel="Choose a thread"
                    onAction={() => setActiveTab('inbox')}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <SectionHeader
            eyebrow="Analytics"
            title="Summary-first launch reporting"
            description="The same normalized statuses drive campaign health, thread counts, and launch outcomes so the page tells one story."
            actions={
              <Button variant="outline" onClick={refresh}>
                <RefreshCcw className="mr-2 size-4" />
                Refresh data
              </Button>
            }
          />

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Outcome counts</CardTitle>
                <CardDescription>These numbers are derived from normalized communication status values.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <StatTile label="Sent" value={formatNumber(analytics.sent)} detail="Messages and voicemail drops sent." icon={Send} />
                  <StatTile label="Delivered" value={formatNumber(analytics.delivered)} detail="Messages that reached the destination." icon={CheckCircle2} />
                  <StatTile label="Replied" value={formatNumber(analytics.replied)} detail="Threads that came back with a reply." icon={Inbox} />
                  <StatTile label="Answered" value={formatNumber(analytics.answered)} detail="Voice events that reached an answer state." icon={Phone} />
                  <StatTile label="Voicemail left" value={formatNumber(analytics.voicemailLeft)} detail="Launches that completed a voicemail drop." icon={MicVocal} />
                  <StatTile label="Failed" value={formatNumber(analytics.failed)} detail="Delivery failures and blocked executions." icon={AlertCircle} />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Campaign health</CardTitle>
                <CardDescription>Active, partial-failure, and review-required states stay visible in one place.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Launched campaigns</p>
                      <p className="mt-1 text-2xl font-semibold">{formatNumber(launchedCount)}</p>
                    </div>
                    {getStateBadge('active')}
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Partial failure</p>
                      <p className="mt-1 text-2xl font-semibold">{formatNumber(partialFailureCount)}</p>
                    </div>
                    {getStateBadge('partially_failed')}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Mixed results are surfaced at both the campaign and thread level.
                  </p>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Review queue</p>
                      <p className="mt-1 text-2xl font-semibold">{formatNumber(reviewQueueCount)}</p>
                    </div>
                    {getStateBadge('review_required')}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Drafts and review-required campaigns cannot launch until their blockers clear.
                  </p>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Suppressed destinations</p>
                      <p className="mt-1 text-2xl font-semibold">
                        {formatNumber(campaigns.reduce((total, campaign) => total + campaign.suppressedCount, 0))}
                      </p>
                    </div>
                    {getStateBadge('suppressed')}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Suppression is shared across SMS, email, and voicemail workflows.
                  </p>
                </div>

                <div className="rounded-2xl border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Status mix</p>
                    <Badge variant="outline">Normalized</Badge>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      { label: 'Sent', value: analytics.sent, total: Math.max(analytics.sent + analytics.failed, 1) },
                      { label: 'Delivered', value: analytics.delivered, total: Math.max(analytics.sent + analytics.failed, 1) },
                      { label: 'Replied', value: analytics.replied, total: Math.max(analytics.sent, 1) },
                      { label: 'Failed', value: analytics.failed, total: Math.max(analytics.sent + analytics.failed, 1) },
                    ].map((row) => (
                      <div key={row.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{row.label}</span>
                          <span>{formatNumber(row.value)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-2 rounded-full',
                              row.label === 'Failed' ? 'bg-red-500' : row.label === 'Replied' ? 'bg-emerald-500' : 'bg-sky-500'
                            )}
                            style={{ width: `${Math.max(8, Math.round((row.value / row.total) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === 'launch' ? 'Launch campaign' : 'Suppress destination'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'launch'
                ? 'Confirm that review is complete and the campaign can move from draft into launch.'
                : 'Confirm that this destination should be added to the global suppression list.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            {dialogMode === 'launch' && selectedCampaign ? (
              <>
                <p>
                  {selectedCampaign.name} will launch as a {channelMeta[selectedCampaign.channel].label} campaign.
                </p>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm font-medium text-foreground">Launch summary</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border bg-background p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Eligible</p>
                      <p className="text-sm font-semibold">{formatNumber(selectedCampaign.eligibleCount)}</p>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Suppressed</p>
                      <p className="text-sm font-semibold text-red-700 dark:text-red-300">{formatNumber(selectedCampaign.suppressedCount)}</p>
                    </div>
                    <div className="rounded-xl border bg-background p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Ineligible</p>
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{formatNumber(selectedCampaign.ineligibleCount)}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            {dialogMode === 'suppress' && selectedThread ? (
              <>
                <p>
                  {selectedThread.contactName} at {selectedThread.propertyLabel} will be blocked from future SMS, email, or voicemail launches.
                </p>
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <p className="text-sm font-medium text-foreground">Thread impact</p>
                  <p className="mt-2 text-sm">
                    The thread will stop receiving outbound actions and the inbox will mark it as suppressed.
                  </p>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button variant={dialogMode === 'suppress' ? 'destructive' : 'default'} onClick={confirmDialog}>
              {dialogMode === 'launch' ? 'Confirm launch' : 'Confirm suppression'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
