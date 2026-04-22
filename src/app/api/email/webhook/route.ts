import { NextRequest, NextResponse } from 'next/server'
import { Resend, type WebhookEventPayload } from 'resend'

import {
  decodeAppOwnedReplyToken,
  extractAppOwnedReplyToken,
  type ResendReplyContext,
} from '@/lib/email'
import {
  normalizeCommunicationStatus,
  normalizeEmailAddress,
  upsertCommunicationThreadSummary,
} from '@/lib/marketing/communications'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type SupabaseErrorLike = {
  code?: string
  message: string
}

function isMissingRelation(error: SupabaseErrorLike | null) {
  if (!error) return false

  return (
    error.code === '42P01' ||
    error.message.toLowerCase().includes('does not exist') ||
    error.message.toLowerCase().includes('schema cache')
  )
}

function parseMailbox(value: string | null | undefined) {
  const normalized = (value || '').trim()
  if (!normalized) {
    return null
  }

  const angleMatch = normalized.match(/<([^>]+)>/)
  const candidate = angleMatch ? angleMatch[1] : normalized
  return normalizeEmailAddress(candidate)
}

function getWebhookSecret() {
  return process.env.RESEND_WEBHOOK_SECRET || process.env.RESEND_EMAIL_WEBHOOK_SECRET || null
}

function buildReplyContextFromTags(tags: Record<string, string> | undefined) {
  if (!tags) {
    return null
  }

  const explicitToken = tags.replyToken || tags.reply_token || null
  const decodedToken = explicitToken ? decodeAppOwnedReplyToken(explicitToken) : null

  return {
    ...(decodedToken || {}),
    campaignId: tags.campaignId || tags.campaign_id || decodedToken?.campaignId || null,
    campaignVersionId:
      tags.campaignVersionId || tags.campaign_version_id || decodedToken?.campaignVersionId || null,
    contactRunId: tags.contactRunId || tags.contact_run_id || decodedToken?.contactRunId || null,
    stepRunId: tags.stepRunId || tags.step_run_id || decodedToken?.stepRunId || null,
    threadId: tags.threadId || tags.thread_id || decodedToken?.threadId || null,
    ownerUserId: tags.ownerUserId || tags.owner_user_id || decodedToken?.ownerUserId || null,
    recipient: tags.recipient || decodedToken?.recipient || null,
  } satisfies ResendReplyContext
}

function extractReplyContextFromReceivedEvent(event: Extract<WebhookEventPayload, { type: 'email.received' }>) {
  const addresses = [...event.data.to, ...event.data.cc, ...event.data.bcc]

  for (const address of addresses) {
    const token = extractAppOwnedReplyToken(address)
    if (!token) {
      continue
    }

    const decoded = decodeAppOwnedReplyToken(token)
    if (decoded) {
      return decoded
    }
  }

  return null
}

async function safeMaybeSingle<T>(
  operation: PromiseLike<{ data: T | null; error: SupabaseErrorLike | null }>
) {
  const { data, error } = await operation

  if (error) {
    if (isMissingRelation(error)) {
      return null
    }

    throw new Error(error.message)
  }

  return data
}

async function stopContactRun(params: {
  supabase: ReturnType<typeof createAdminClient>
  contactRunId: string | null | undefined
  stopReason: string
}) {
  if (!params.contactRunId) {
    return
  }

  const { error: contactRunError } = await params.supabase
    .from('campaign_contact_runs')
    .update({
      status: 'stopped',
      stop_reason: params.stopReason,
      next_due_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.contactRunId)

  if (contactRunError && !isMissingRelation(contactRunError)) {
    throw new Error(`Failed to stop contact run: ${contactRunError.message}`)
  }

  const { error: stepRunsError } = await params.supabase
    .from('campaign_step_runs')
    .update({
      status: 'stopped',
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('contact_run_id', params.contactRunId)
    .in('status', ['queued', 'claimed', 'running', 'waiting'])

  if (stepRunsError && !isMissingRelation(stepRunsError)) {
    throw new Error(`Failed to stop queued step runs: ${stepRunsError.message}`)
  }
}

async function upsertEmailSuppression(params: {
  supabase: ReturnType<typeof createAdminClient>
  ownerUserId: string | null
  propertyId: string | null
  contactId: string | null
  destination: string | null
  reason: string
}) {
  if (!params.ownerUserId || !params.destination) {
    return
  }

  const { data: existing } = await params.supabase
    .from('global_suppressions')
    .select('id')
    .eq('owner_user_id', params.ownerUserId)
    .eq('channel', 'email')
    .eq('destination', params.destination)
    .maybeSingle()

  const payload = {
    owner_user_id: params.ownerUserId,
    property_id: params.propertyId,
    contact_id: params.contactId,
    channel: 'email',
    destination: params.destination,
    reason: params.reason,
    source: 'email_webhook',
    status: 'active',
    suppressed_at: new Date().toISOString(),
    resolved_at: null,
  }

  if (existing?.id) {
    const { error } = await params.supabase
      .from('global_suppressions')
      .update(payload)
      .eq('id', existing.id)

    if (error) {
      throw new Error(`Failed to update email suppression: ${error.message}`)
    }

    return
  }

  const { error } = await params.supabase.from('global_suppressions').insert(payload)
  if (error) {
    throw new Error(`Failed to create email suppression: ${error.message}`)
  }
}

async function resolveContextState(params: {
  supabase: ReturnType<typeof createAdminClient>
  replyContext: ResendReplyContext | null
}) {
  const { supabase, replyContext } = params
  let ownerUserId = replyContext?.ownerUserId || null
  let propertyId: string | null = null
  let contactId: string | null = null
  let campaignId = replyContext?.campaignId || null
  const threadId = replyContext?.threadId || null

  if (replyContext?.contactRunId) {
    const contactRun = await safeMaybeSingle(
      supabase
        .from('campaign_contact_runs')
        .select('id, owner_user_id, property_id, contact_id, campaign_id')
        .eq('id', replyContext.contactRunId)
        .maybeSingle()
    )

    if (contactRun) {
      ownerUserId = ownerUserId || String((contactRun as Record<string, unknown>).owner_user_id || '')
      propertyId = String((contactRun as Record<string, unknown>).property_id || '') || null
      contactId = String((contactRun as Record<string, unknown>).contact_id || '') || null
      campaignId = campaignId || (String((contactRun as Record<string, unknown>).campaign_id || '') || null)
    }
  }

  if (threadId) {
    const thread = await safeMaybeSingle(
      supabase
        .from('communication_threads')
        .select('id, owner_user_id, property_id, contact_id, campaign_id')
        .eq('id', threadId)
        .maybeSingle()
    )

    if (thread) {
      ownerUserId = ownerUserId || String((thread as Record<string, unknown>).owner_user_id || '')
      propertyId = propertyId || (String((thread as Record<string, unknown>).property_id || '') || null)
      contactId = contactId || (String((thread as Record<string, unknown>).contact_id || '') || null)
      campaignId = campaignId || (String((thread as Record<string, unknown>).campaign_id || '') || null)
    }
  }

  return {
    ownerUserId: ownerUserId || null,
    propertyId,
    contactId,
    campaignId,
  }
}

async function recordCommunicationLog(params: {
  supabase: ReturnType<typeof createAdminClient>
  ownerUserId: string | null
  propertyId: string | null
  direction: 'inbound' | 'outbound'
  subject: string
  recipient: string | null
  status: string
  content: string
}) {
  const { error } = await params.supabase.from('communication_logs').insert({
    property_id: params.propertyId,
    user_id: params.ownerUserId,
    type: 'email',
    direction: params.direction,
    subject: params.subject,
    recipient: params.recipient,
    status: params.status,
    content: params.content,
  })

  if (error) {
    throw new Error(`Failed to write email communication log: ${error.message}`)
  }
}

function isHardBounce(event: Extract<WebhookEventPayload, { type: 'email.bounced' }>) {
  return (event.data.bounce.type || '').toLowerCase().includes('hard')
}

async function verifyResendWebhook(request: NextRequest, rawPayload: string) {
  const secret = getWebhookSecret()
  const shouldRequireSecret =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

  if (!secret && shouldRequireSecret) {
    throw new Error('Resend webhook secret is not configured.')
  }

  if (!secret) {
    return JSON.parse(rawPayload) as WebhookEventPayload
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  return resend.webhooks.verify({
    payload: rawPayload,
    headers: {
      id: request.headers.get('svix-id') || '',
      timestamp: request.headers.get('svix-timestamp') || '',
      signature: request.headers.get('svix-signature') || '',
    },
    webhookSecret: secret,
  })
}

export async function POST(request: NextRequest) {
  try {
    const rawPayload = await request.text()
    const event = await verifyResendWebhook(request, rawPayload)
    const supabase = createAdminClient()

    if (event.type === 'email.received') {
      const replyContext = extractReplyContextFromReceivedEvent(event)
      const contextState = await resolveContextState({ supabase, replyContext })
      const fromAddress = parseMailbox(event.data.from)

      if (!contextState.ownerUserId || !fromAddress) {
        return NextResponse.json({ ok: true, skipped: 'unresolved-context' })
      }

      await recordCommunicationLog({
        supabase,
        ownerUserId: contextState.ownerUserId,
        propertyId: contextState.propertyId,
        direction: 'inbound',
        subject: event.data.subject || 'Inbound reply',
        recipient: fromAddress,
        status: 'replied',
        content: JSON.stringify(event.data),
      })

      await upsertCommunicationThreadSummary(supabase, {
        ownerUserId: contextState.ownerUserId,
        propertyId: contextState.propertyId,
        contactId: contextState.contactId,
        campaignId: contextState.campaignId,
        destination: fromAddress,
        channel: 'email',
        direction: 'inbound',
        status: 'replied',
        eventAt: event.created_at || event.data.created_at,
        incrementUnreadCount: true,
        needsReply: true,
      })

      await stopContactRun({
        supabase,
        contactRunId: replyContext?.contactRunId,
        stopReason: 'email_reply',
      })

      return NextResponse.json({ ok: true })
    }

    if (
      event.type === 'email.delivered' ||
      event.type === 'email.failed' ||
      event.type === 'email.bounced' ||
      event.type === 'email.complained' ||
      event.type === 'email.suppressed'
    ) {
      const replyContext = buildReplyContextFromTags(event.data.tags)
      const contextState = await resolveContextState({ supabase, replyContext })
      const recipient = parseMailbox(event.data.to?.[0] || replyContext?.recipient || null)
      const status = normalizeCommunicationStatus({
        channel: 'email',
        status: event.type.replace('email.', ''),
      })

      await recordCommunicationLog({
        supabase,
        ownerUserId: contextState.ownerUserId,
        propertyId: contextState.propertyId,
        direction: 'outbound',
        subject: event.data.subject || 'Email event',
        recipient,
        status,
        content: JSON.stringify(event.data),
      })

      if (contextState.ownerUserId && recipient) {
        await upsertCommunicationThreadSummary(supabase, {
          ownerUserId: contextState.ownerUserId,
          propertyId: contextState.propertyId,
          contactId: contextState.contactId,
          campaignId: contextState.campaignId,
          destination: recipient,
          channel: 'email',
          direction: 'outbound',
          status,
          eventAt: event.created_at || event.data.created_at,
          incrementUnreadCount: false,
          needsReply: event.type === 'email.failed' ? true : undefined,
        })
      }

      const shouldStopFutureSteps =
        event.type === 'email.complained' ||
        event.type === 'email.suppressed' ||
        event.type === 'email.failed' ||
        (event.type === 'email.bounced' && isHardBounce(event))

      if (shouldStopFutureSteps) {
        await stopContactRun({
          supabase,
          contactRunId: replyContext?.contactRunId,
          stopReason: event.type.replace('email.', 'email_'),
        })
      }

      if (
        event.type === 'email.complained' ||
        event.type === 'email.suppressed' ||
        (event.type === 'email.bounced' && isHardBounce(event))
      ) {
        await upsertEmailSuppression({
          supabase,
          ownerUserId: contextState.ownerUserId,
          propertyId: contextState.propertyId,
          contactId: contextState.contactId,
          destination: recipient,
          reason: event.type,
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Email webhook error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
