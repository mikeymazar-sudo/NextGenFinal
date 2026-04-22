import { createAdminClient } from '@/lib/supabase/server'
import type { NormalizedCommunicationStatus } from '@/types/schema'
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

type CommunicationThreadChannel = 'sms' | 'email' | 'voice'

type ThreadDirection = 'inbound' | 'outbound'

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

export function normalizeCommunicationStatus(params: {
  channel: MarketingCommChannel | 'voice'
  status: string | null | undefined
  direction?: ThreadDirection
  answeredBy?: string | null
  isVoicemailCampaign?: boolean
}): NormalizedCommunicationStatus {
  const normalized = coerceString(params.status).toLowerCase()
  const answeredBy = coerceString(params.answeredBy).toLowerCase()
  const isMachineAnswer = /machine|fax|voicemail|amd|answering_machine/.test(answeredBy)
  const isVoicemailCampaign = Boolean(params.isVoicemailCampaign)

  if (params.channel === 'voice') {
    if (!normalized) {
      return isVoicemailCampaign && isMachineAnswer ? 'voicemail_left' : 'answered'
    }

    if (['busy', 'no-answer', 'no_answer', 'no answer', 'unanswered'].includes(normalized)) {
      return 'no_answer'
    }

    if (
      ['canceled', 'cancelled', 'failed', 'error', 'timeout', 'rejected'].includes(normalized)
    ) {
      return 'failed'
    }

    if (['queued', 'accepted', 'sending', 'scheduled'].includes(normalized)) {
      return 'queued'
    }

    if (['answered', 'completed'].includes(normalized)) {
      return isMachineAnswer || (isVoicemailCampaign && !answeredBy) ? 'voicemail_left' : 'answered'
    }

    if (['in-progress', 'in_progress', 'ringing'].includes(normalized)) {
      return 'answered'
    }

    return isVoicemailCampaign && isMachineAnswer ? 'voicemail_left' : 'answered'
  }

  if (!normalized) {
    if (params.direction === 'inbound') {
      return 'replied'
    }

    return 'sent'
  }

  if (['queued', 'accepted', 'sending', 'scheduled', 'processing', 'ringing', 'in-progress', 'in_progress'].includes(normalized)) {
    return 'queued'
  }

  if (['sent', 'sending_complete', 'dialing'].includes(normalized)) {
    return 'sent'
  }

  if (['delivered', 'read'].includes(normalized)) {
    return 'delivered'
  }

  if (['reply', 'replied', 'responded', 'received'].includes(normalized)) {
    return 'replied'
  }

  if (['answered', 'answered_machine', 'human', 'human_answered'].includes(normalized)) {
    return 'answered'
  }

  if (['voicemail_left', 'voicemail', 'machine', 'machine_answer', 'machine_answered'].includes(normalized)) {
    return 'voicemail_left'
  }

  if (['failed', 'error', 'blocked', 'undelivered', 'canceled', 'cancelled', 'timeout', 'rejected'].includes(normalized)) {
    return 'failed'
  }

  if (['bounce', 'bounced', 'complaint', 'complained'].includes(normalized)) {
    return 'bounced'
  }

  if (['busy', 'no-answer', 'no_answer', 'no answer', 'unanswered', 'no answer detected'].includes(normalized)) {
    return 'no_answer'
  }

  if (params.direction === 'inbound') {
    return 'replied'
  }

  return 'sent'
}

export function buildCommunicationThreadKey(
  ownerUserId: string,
  propertyId: string | null,
  contactId: string | null,
  destination: string
) {
  return [ownerUserId, propertyId || 'null', contactId || 'null', destination].join(':').toLowerCase()
}

function getThreadDirection(
  channel: CommunicationThreadChannel,
  direction: ThreadDirection,
  lastStatus: NormalizedCommunicationStatus
) {
  if (channel === 'voice') {
    return 'outbound'
  }

  if (lastStatus === 'replied' && direction === 'inbound') {
    return 'inbound'
  }

  return direction
}

async function findContactByPhoneNumber(
  ownerUserId: string,
  phoneNumber: string,
  supabase = createAdminClient()
) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber)
  if (!normalizedPhone) {
    return null
  }

  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('id')
    .eq('created_by', ownerUserId)

  if (propertiesError) {
    throw new Error(`Failed to load owner properties: ${propertiesError.message}`)
  }

  const propertyIds = (properties || []).map((property) => property.id)
  if (!propertyIds.length) {
    return null
  }

  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, property_id, phone_numbers')
    .in('property_id', propertyIds)

  if (contactsError) {
    throw new Error(`Failed to load owner contacts: ${contactsError.message}`)
  }

  const matchesEntry = (entry: unknown) => {
    if (typeof entry === 'string') {
      return normalizePhoneNumber(entry) === normalizedPhone
    }

    if (!entry || typeof entry !== 'object') {
      return false
    }

    const record = entry as { value?: unknown }
    return typeof record.value === 'string' && normalizePhoneNumber(record.value) === normalizedPhone
  }

  return (
    contacts?.find(
      (contact) => Array.isArray(contact.phone_numbers) && contact.phone_numbers.some(matchesEntry)
    ) || null
  )
}

export async function upsertCommunicationThreadSummary(
  supabase: ReturnType<typeof createAdminClient>,
  context: {
    ownerUserId: string
    propertyId: string | null
    contactId: string | null
    campaignId?: string | null
    destination: string
    channel: CommunicationThreadChannel
    direction: ThreadDirection
    status: NormalizedCommunicationStatus
    eventAt: string
    incrementUnreadCount?: boolean
    needsReply?: boolean
  }
) {
  const threadKey = buildCommunicationThreadKey(
    context.ownerUserId,
    context.propertyId,
    context.contactId,
    context.destination
  )
  const eventTime = new Date(context.eventAt).getTime()

  const { data: existingThread, error: existingThreadError } = await supabase
    .from('communication_threads')
    .select(
      'id, owner_user_id, property_id, contact_id, campaign_id, thread_key, primary_channel, last_direction, last_status, last_event_at, unread_count, needs_reply'
    )
    .eq('owner_user_id', context.ownerUserId)
    .eq('thread_key', threadKey)
    .maybeSingle()

  if (existingThreadError) {
    throw new Error(`Failed to load communication thread summary: ${existingThreadError.message}`)
  }

  const threadPayload = {
    owner_user_id: context.ownerUserId,
    property_id: context.propertyId,
    contact_id: context.contactId,
    campaign_id: context.campaignId || null,
    thread_key: threadKey,
    primary_channel: context.channel,
    last_direction: getThreadDirection(context.channel, context.direction, context.status),
    last_status: context.status,
    last_event_at: context.eventAt,
    unread_count: context.incrementUnreadCount
      ? (existingThread?.unread_count || 0) + 1
      : existingThread?.unread_count || 0,
    needs_reply:
      context.needsReply ?? (context.direction === 'inbound' && context.channel !== 'voice'),
  }

  if (!existingThread) {
    const { error } = await supabase.from('communication_threads').insert(threadPayload)

    if (error) {
      throw new Error(`Failed to create communication thread summary: ${error.message}`)
    }

    return { threadKey, created: true as const }
  }

  if (eventTime < new Date(existingThread.last_event_at).getTime()) {
    return { threadKey, created: false as const, skipped: true as const }
  }

  const { error } = await supabase
    .from('communication_threads')
    .update({
      property_id: context.propertyId,
      contact_id: context.contactId,
      campaign_id: context.campaignId ?? existingThread.campaign_id,
      primary_channel: context.channel,
      last_direction: getThreadDirection(context.channel, context.direction, context.status),
      last_status: context.status,
      last_event_at: context.eventAt,
      unread_count: context.incrementUnreadCount
        ? (existingThread.unread_count || 0) + 1
        : existingThread.unread_count || 0,
      needs_reply:
        context.needsReply ?? (existingThread.needs_reply || (context.direction === 'inbound' && context.channel !== 'voice')),
    })
    .eq('id', existingThread.id)

  if (error) {
    throw new Error(`Failed to update communication thread summary: ${error.message}`)
  }

  return { threadKey, created: false as const }
}

async function loadMessageByTwilioSid(
  supabase: ReturnType<typeof createAdminClient>,
  twilioSid: string
) {
  const { data, error } = await supabase
    .from('messages')
    .select(
      'id, body, direction, status, from_number, to_number, twilio_sid, twilio_status, error_code, error_message, user_id, user_phone_number_id, contact_id, property_id, media_urls, num_segments, price, price_unit, created_at, updated_at'
    )
    .eq('twilio_sid', twilioSid)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load SMS event by SID: ${error.message}`)
  }

  return data as Record<string, unknown> | null
}

export async function recordInboundSmsCommunication(params: {
  from: string
  to: string
  body: string
  messageSid?: string
  smsStatus?: string
  mediaUrls?: string[]
  numSegments?: number
}) {
  const normalizedTo = normalizePhoneNumber(params.to)
  const normalizedFrom = normalizePhoneNumber(params.from)

  if (!normalizedTo || !normalizedFrom) {
    throw new Error('Invalid inbound phone number payload.')
  }

  const supabase = createAdminClient()
  const { data: assignment, error: assignmentError } = await supabase
    .from('user_phone_numbers')
    .select('*')
    .eq('phone_number', normalizedTo)
    .maybeSingle()

  if (assignmentError) {
    throw new Error(`Failed to resolve inbound SMS assignment: ${assignmentError.message}`)
  }

  if (!assignment) {
    return { stored: false as const, reason: 'unowned-number' as const }
  }

  const contact = await findContactByPhoneNumber(assignment.user_id, normalizedFrom, supabase)
  const suppressionKeywordResult = await applyInboundSmsSuppressionKeyword({
    ownerUserId: assignment.user_id,
    destination: normalizedFrom,
    body: params.body,
    contactId: contact?.id || null,
    propertyId: contact?.property_id || null,
    supabase,
  })

  const messageStatus = params.smsStatus
    ? normalizeSmsProviderStatus(params.smsStatus)
    : 'received'
  const messagePayload = {
    body: params.body,
    direction: 'inbound' as const,
    status: messageStatus,
    from_number: normalizedFrom,
    to_number: normalizedTo,
    twilio_sid: params.messageSid || null,
    twilio_status: params.smsStatus || null,
    user_id: assignment.user_id,
    user_phone_number_id: assignment.id,
    contact_id: contact?.id || null,
    property_id: contact?.property_id || null,
    media_urls: params.mediaUrls && params.mediaUrls.length > 0 ? params.mediaUrls : null,
    num_segments: params.numSegments || 1,
  }

  let messageId: string | null = null
  const existingMessage = params.messageSid
    ? await loadMessageByTwilioSid(supabase, params.messageSid)
    : null

  if (params.messageSid) {
    const { data, error } = await supabase
      .from('messages')
      .upsert(messagePayload, { onConflict: 'twilio_sid' })
      .select('id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to store incoming SMS event: ${error.message}`)
    }

    messageId = data?.id || (existingMessage?.id as string | undefined) || null
  } else {
    const { data, error } = await supabase
      .from('messages')
      .insert(messagePayload)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to store incoming SMS event: ${error.message}`)
    }

    messageId = data?.id || null
  }

  await upsertCommunicationThreadSummary(supabase, {
    ownerUserId: assignment.user_id,
    propertyId: contact?.property_id || null,
    contactId: contact?.id || null,
    destination: normalizedFrom,
    channel: 'sms',
    direction: 'inbound',
    status: 'replied',
    eventAt: existingMessage?.created_at ? String(existingMessage.created_at) : new Date().toISOString(),
    incrementUnreadCount: !existingMessage,
    needsReply: true,
  })

  return {
    stored: true as const,
    assignment,
    contact,
    messageId,
    suppressionKeywordResult,
  }
}

export async function updateSmsDeliveryStatus(params: {
  messageSid: string
  status: string
  errorCode?: string
  errorMessage?: string
}) {
  const supabase = createAdminClient()
  const existingMessage = await loadMessageByTwilioSid(supabase, params.messageSid)

  if (!existingMessage) {
    return { updated: false as const, reason: 'missing-message' as const }
  }

  const normalizedStatus = normalizeSmsProviderStatus(params.status)
  const threadStatus = normalizeCommunicationStatus({
    channel: 'sms',
    status: params.status,
  })
  const nextValues = {
    status: normalizedStatus,
    twilio_status: params.status,
    error_code: params.errorCode || null,
    error_message: params.errorMessage || null,
  }

  const currentStatus = typeof existingMessage.status === 'string' ? existingMessage.status : null
  const currentTwilioStatus =
    typeof existingMessage.twilio_status === 'string' ? existingMessage.twilio_status : null
  const currentErrorCode =
    typeof existingMessage.error_code === 'string' ? existingMessage.error_code : null
  const currentErrorMessage =
    typeof existingMessage.error_message === 'string' ? existingMessage.error_message : null

  const isSameUpdate =
    currentStatus === nextValues.status &&
    currentTwilioStatus === nextValues.twilio_status &&
    currentErrorCode === nextValues.error_code &&
    currentErrorMessage === nextValues.error_message

  if (!isSameUpdate) {
    const { error } = await supabase
      .from('messages')
      .update(nextValues)
      .eq('twilio_sid', params.messageSid)

    if (error) {
      throw new Error(`Failed to update message status: ${error.message}`)
    }
  } else {
    return {
      updated: false as const,
      reason: 'duplicate-update' as const,
      status: normalizedStatus,
    }
  }

  const direction = typeof existingMessage.direction === 'string' ? existingMessage.direction : 'outbound'
  const destination =
    direction === 'inbound'
      ? typeof existingMessage.from_number === 'string'
        ? existingMessage.from_number
        : null
      : typeof existingMessage.to_number === 'string'
        ? existingMessage.to_number
        : null

  if (destination) {
    await upsertCommunicationThreadSummary(supabase, {
      ownerUserId: typeof existingMessage.user_id === 'string' ? existingMessage.user_id : '',
      propertyId:
        typeof existingMessage.property_id === 'string' ? existingMessage.property_id : null,
      contactId:
        typeof existingMessage.contact_id === 'string' ? existingMessage.contact_id : null,
      destination,
      channel: 'sms',
      direction: direction === 'inbound' ? 'inbound' : 'outbound',
      status: threadStatus,
      eventAt: new Date().toISOString(),
      incrementUnreadCount: false,
    })
  }

  return {
    updated: true as const,
    status: normalizedStatus,
  }
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
