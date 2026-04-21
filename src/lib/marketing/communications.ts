import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhoneNumber } from '@/lib/utils'

export type MarketingCommChannel = 'sms' | 'email'

export type SmsProviderStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'received'
  | 'replied'

export type EmailProviderStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'replied'
  | 'failed'

const SMS_OPT_OUT_KEYWORDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
])

const SMS_OPT_IN_KEYWORDS = new Set(['START', 'UNSTOP', 'RESUME'])

function coerceString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeEmailAddress(value: string | null | undefined) {
  const normalized = coerceString(value).toLowerCase()
  return normalized || null
}

export function normalizeSmsProviderStatus(status: string | null | undefined): SmsProviderStatus {
  const normalized = coerceString(status).toLowerCase()

  if (!normalized) {
    return 'sent'
  }

  if (['queued', 'accepted', 'sending', 'scheduled'].includes(normalized)) {
    return 'queued'
  }

  if (['sent', 'sending_complete'].includes(normalized)) {
    return 'sent'
  }

  if (['delivered', 'read'].includes(normalized)) {
    return 'delivered'
  }

  if (['received'].includes(normalized)) {
    return 'received'
  }

  if (['reply', 'replied'].includes(normalized)) {
    return 'replied'
  }

  if (['failed', 'undelivered', 'canceled', 'cancelled', 'error'].includes(normalized)) {
    return 'failed'
  }

  return 'sent'
}

export function normalizeEmailProviderStatus(status: string | null | undefined): EmailProviderStatus {
  const normalized = coerceString(status).toLowerCase()

  if (!normalized) {
    return 'sent'
  }

  if (['queued', 'sending', 'scheduled'].includes(normalized)) {
    return 'queued'
  }

  if (['delivered', 'delivery'].includes(normalized)) {
    return 'delivered'
  }

  if (['bounce', 'bounced', 'complaint', 'complained'].includes(normalized)) {
    return 'bounced'
  }

  if (['reply', 'replied', 'responded'].includes(normalized)) {
    return 'replied'
  }

  if (['failed', 'error', 'blocked', 'unsubscribed', 'unsubscribe'].includes(normalized)) {
    return 'failed'
  }

  return 'sent'
}

export function normalizeSmsKeyword(body: string | null | undefined) {
  const normalized = coerceString(body)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || null
}

export function isSmsOptOutKeyword(body: string | null | undefined) {
  const keyword = normalizeSmsKeyword(body)
  return keyword ? SMS_OPT_OUT_KEYWORDS.has(keyword) : false
}

export function isSmsOptInKeyword(body: string | null | undefined) {
  const keyword = normalizeSmsKeyword(body)
  return keyword ? SMS_OPT_IN_KEYWORDS.has(keyword) : false
}

export function normalizeMarketingDestination(channel: MarketingCommChannel, value: string) {
  return channel === 'email' ? normalizeEmailAddress(value) : normalizePhoneNumber(value)
}

async function findLatestSmsSuppression(params: {
  ownerUserId: string
  destination: string
  supabase?: ReturnType<typeof createAdminClient>
}) {
  const supabase = params.supabase ?? createAdminClient()
  const query = supabase
    .from('global_suppressions')
    .select(
      'id, owner_user_id, property_id, contact_id, channel, destination, reason, source, status, suppressed_at, resolved_at'
    )
    .eq('owner_user_id', params.ownerUserId)
    .eq('channel', 'sms')
    .eq('destination', params.destination)
    .is('resolved_at', null)
    .order('suppressed_at', { ascending: false })
    .limit(1)

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return data || null
}

export async function applyInboundSmsSuppressionKeyword(params: {
  ownerUserId: string
  destination: string
  body: string
  contactId?: string | null
  propertyId?: string | null
  supabase?: ReturnType<typeof createAdminClient>
}) {
  const keyword = normalizeSmsKeyword(params.body)
  if (!keyword) {
    return { action: 'none' as const, keyword: null }
  }

  const normalizedDestination = normalizePhoneNumber(params.destination)
  if (!normalizedDestination) {
    return { action: 'none' as const, keyword }
  }

  const supabase = params.supabase ?? createAdminClient()
  const now = new Date().toISOString()
  const existing = await findLatestSmsSuppression({
    ownerUserId: params.ownerUserId,
    destination: normalizedDestination,
    supabase,
  })

  if (isSmsOptOutKeyword(keyword)) {
    const payload = {
      owner_user_id: params.ownerUserId,
      property_id: params.propertyId || existing?.property_id || null,
      contact_id: params.contactId || existing?.contact_id || null,
      channel: 'sms' as const,
      destination: normalizedDestination,
      reason: keyword,
      source: 'sms_webhook',
      status: 'suppressed',
      suppressed_at: now,
      resolved_at: null,
    }

    if (existing?.id) {
      const { error } = await supabase
        .from('global_suppressions')
        .update(payload)
        .eq('id', existing.id)

      if (error) {
        throw error
      }
    } else {
      const { error } = await supabase.from('global_suppressions').insert(payload)

      if (error) {
        throw error
      }
    }

    return { action: 'suppressed' as const, keyword }
  }

  if (isSmsOptInKeyword(keyword) && existing?.id) {
    const { error } = await supabase
      .from('global_suppressions')
      .update({
        status: 'resolved',
        reason: keyword,
        source: 'sms_webhook',
        resolved_at: now,
      })
      .eq('id', existing.id)

    if (error) {
      throw error
    }

    return { action: 'resolved' as const, keyword }
  }

  return { action: 'none' as const, keyword }
}

export async function recordOutboundEmailCommunication(params: {
  userId: string
  to: string
  subject: string
  content: string
  propertyId?: string | null
  status?: string
  supabase?: ReturnType<typeof createAdminClient>
}) {
  const supabase = params.supabase ?? createAdminClient()
  const recipient = normalizeEmailAddress(params.to)

  if (!recipient) {
    throw new Error('Recipient email is required to record communication.')
  }

  const { data, error } = await supabase
    .from('communication_logs')
    .insert({
      property_id: params.propertyId || null,
      user_id: params.userId,
      type: 'email',
      direction: 'outbound',
      subject: params.subject,
      content: params.content,
      recipient,
      status: params.status || 'sent',
    })
    .select('id, created_at')
    .maybeSingle()

  if (error) {
    return { success: false as const, error }
  }

  return { success: true as const, data }
}
