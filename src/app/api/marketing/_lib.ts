import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhoneNumber } from '@/lib/utils'
import { resolveMarketingActor } from '@/lib/marketing/actor'

type MaybeRecord = Record<string, unknown> | null

export type MarketingActorProfile = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  team_id: string | null
}

export type MarketingCampaignRecord = {
  id: string
  owner_user_id: string
  team_id: string | null
  name: string
  channel: 'sms' | 'email' | 'voice'
  status: string
  review_state: string
  launch_state: string
  audience_source_type: string | null
  audience_source_id: string | null
  draft_payload: Record<string, unknown> | null
  launched_at: string | null
  created_at: string
  updated_at: string
}

export type MarketingUnifiedEvent = {
  id: string
  threadKey: string
  type: 'sms' | 'email' | 'voice' | 'voicemail' | 'note' | 'activity'
  channel: 'sms' | 'email' | 'voice' | 'note' | 'activity'
  direction: 'inbound' | 'outbound' | 'internal'
  status: string
  title: string
  content: string
  createdAt: string
  propertyId: string | null
  contactId: string | null
  destination: string | null
  meta?: Record<string, unknown>
}

export type MarketingThreadSummary = {
  id: string
  title: string
  channel: 'sms' | 'email' | 'voice' | 'mixed'
  status: string
  preview: string
  lastEventAt: string
  unreadCount: number
  needsReply: boolean
  propertyId: string | null
  contactId: string | null
  eventCount: number
}

type ContactRow = {
  id: string
  property_id: string
  name: string | null
  phone_numbers: unknown[] | null
  emails: unknown[] | null
}

type PropertyRow = {
  id: string
  address: string
  city: string | null
  state: string | null
  owner_name: string | null
  owner_phone: string[] | null
  list_id: string | null
  raw_realestate_data: MaybeRecord
}

type SuppressionRow = {
  channel: string
  destination: string | null
  contact_id: string | null
  property_id: string | null
  status: string | null
  resolved_at: string | null
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase()
  return trimmed || null
}

function pickFirstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function extractEntryValue(entry: unknown) {
  if (typeof entry === 'string') {
    return entry.trim() || null
  }

  const record = coerceRecord(entry)
  const value = record?.value
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function pickContactPhone(contact: ContactRow | null) {
  const values = contact?.phone_numbers || []

  for (const entry of values) {
    const normalized = normalizePhoneNumber(extractEntryValue(entry) || '')
    if (normalized) {
      return normalized
    }
  }

  return null
}

function pickContactEmail(contact: ContactRow | null) {
  const values = contact?.emails || []

  for (const entry of values) {
    const normalized = normalizeEmail(extractEntryValue(entry))
    if (normalized) {
      return normalized
    }
  }

  return null
}

function pickPropertyEmail(property: PropertyRow) {
  const raw = coerceRecord(property.raw_realestate_data)
  const data = coerceRecord(raw?.data)
  const ownerInfo = coerceRecord(data?.ownerInfo)
  const email =
    typeof ownerInfo?.email === 'string'
      ? ownerInfo.email
      : typeof ownerInfo?.emailAddress === 'string'
        ? ownerInfo.emailAddress
        : null

  return normalizeEmail(email)
}

function pickPropertyPhone(property: PropertyRow) {
  const direct = pickFirstString(property.owner_phone || [])
  const normalizedDirect = normalizePhoneNumber(direct || '')
  if (normalizedDirect) {
    return normalizedDirect
  }

  const raw = coerceRecord(property.raw_realestate_data)
  const data = coerceRecord(raw?.data)
  const ownerInfo = coerceRecord(data?.ownerInfo)
  const phone = typeof ownerInfo?.phone === 'string' ? ownerInfo.phone : null
  return normalizePhoneNumber(phone || '')
}

function threadKeyForEvent(event: {
  contactId: string | null
  propertyId: string | null
  destination: string | null
  channel: string
}) {
  return [
    event.contactId || 'contactless',
    event.propertyId || 'propertyless',
    event.destination || event.channel,
  ].join(':')
}

async function safeSelect<T>(label: string, promise: PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>) {
  const { data, error } = await promise

  if (error) {
    const isMissingTable =
      error.code === '42P01' ||
      error.message.toLowerCase().includes('does not exist') ||
      error.message.toLowerCase().includes('schema cache')

    if (isMissingTable) {
      return [] as T[]
    }

    throw new Error(`${label}: ${error.message}`)
  }

  return data || []
}

async function safeSingle<T>(label: string, promise: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>) {
  const { data, error } = await promise

  if (error) {
    const isMissingTable =
      error.code === '42P01' ||
      error.message.toLowerCase().includes('does not exist') ||
      error.message.toLowerCase().includes('schema cache')

    if (isMissingTable) {
      return null
    }

    throw new Error(`${label}: ${error.message}`)
  }

  return data
}

export async function getMarketingActorProfile(userId: string, email: string | null) {
  const actor = await resolveMarketingActor(userId, { email })

  return {
    id: userId,
    email: actor.email,
    full_name: actor.fullName,
    role: actor.role,
    team_id: actor.teamId,
  } satisfies MarketingActorProfile
}

export async function getOwnedCampaign(campaignId: string, ownerUserId: string) {
  const supabase = createAdminClient()

  return safeSingle(
    'campaign lookup',
    supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('owner_user_id', ownerUserId)
      .maybeSingle()
  ) as Promise<MarketingCampaignRecord | null>
}

export async function listOwnedCampaigns(ownerUserId: string) {
  const supabase = createAdminClient()

  return safeSelect(
    'campaign list',
    supabase
      .from('campaigns')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .order('updated_at', { ascending: false })
  ) as Promise<MarketingCampaignRecord[]>
}

export async function getCampaignSteps(campaignId: string) {
  const supabase = createAdminClient()

  return safeSelect(
    'campaign steps',
    supabase
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('step_order', { ascending: true })
  )
}

export async function getCampaignEnrollments(campaignId: string) {
  const supabase = createAdminClient()

  return safeSelect(
    'campaign enrollments',
    supabase
      .from('campaign_enrollments')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
  )
}

export async function resolveCampaignAudience(campaign: MarketingCampaignRecord) {
  const supabase = createAdminClient()
  const draftPayload = coerceRecord(campaign.draft_payload)
  const audiencePropertyIds = Array.isArray(draftPayload?.propertyIds)
    ? draftPayload.propertyIds.filter((value): value is string => typeof value === 'string')
    : []

  if (
    (campaign.audience_source_type === 'lead_list' || campaign.audience_source_type === 'csv_import') &&
    campaign.audience_source_id
  ) {
    return safeSelect(
      'audience properties by list',
      supabase
        .from('properties')
        .select('id, address, city, state, owner_name, owner_phone, list_id, raw_realestate_data')
        .eq('created_by', campaign.owner_user_id)
        .eq('list_id', campaign.audience_source_id)
        .order('created_at', { ascending: false })
    ) as Promise<PropertyRow[]>
  }

  if (audiencePropertyIds.length > 0) {
    return safeSelect(
      'audience properties by ids',
      supabase
        .from('properties')
        .select('id, address, city, state, owner_name, owner_phone, list_id, raw_realestate_data')
        .eq('created_by', campaign.owner_user_id)
        .in('id', audiencePropertyIds)
    ) as Promise<PropertyRow[]>
  }

  return [] as PropertyRow[]
}

export async function buildCampaignReview(campaign: MarketingCampaignRecord) {
  const supabase = createAdminClient()
  const audience = await resolveCampaignAudience(campaign)
  const propertyIds = audience.map((property) => property.id)

  const contacts = propertyIds.length
    ? await safeSelect(
        'campaign contacts',
        supabase
          .from('contacts')
          .select('id, property_id, name, phone_numbers, emails')
          .in('property_id', propertyIds)
      ) as ContactRow[]
    : []

  const suppressions = await safeSelect(
    'campaign suppressions',
    supabase
      .from('global_suppressions')
      .select('channel, destination, contact_id, property_id, status, resolved_at')
      .eq('owner_user_id', campaign.owner_user_id)
  ) as SuppressionRow[]

  const suppressionsByChannel = new Map<string, Set<string>>()
  const activeSuppressions = suppressions.filter(
    (entry) => entry.status !== 'resolved' && entry.resolved_at === null
  )

  for (const suppression of activeSuppressions) {
    if (!suppression.destination) continue
    const channel = suppression.channel || 'all'
    if (!suppressionsByChannel.has(channel)) {
      suppressionsByChannel.set(channel, new Set())
    }
    suppressionsByChannel.get(channel)?.add(
      campaign.channel === 'email'
        ? normalizeEmail(suppression.destination) || suppression.destination
        : normalizePhoneNumber(suppression.destination) || suppression.destination
    )
  }

  const contactsByProperty = new Map<string, ContactRow[]>()
  for (const contact of contacts) {
    const existing = contactsByProperty.get(contact.property_id) || []
    existing.push(contact)
    contactsByProperty.set(contact.property_id, existing)
  }

  const reviewRows = audience.map((property) => {
    const propertyContacts = contactsByProperty.get(property.id) || []
    const contact = propertyContacts[0] || null
    const destination =
      campaign.channel === 'email'
        ? pickContactEmail(contact) || pickPropertyEmail(property)
        : pickContactPhone(contact) || pickPropertyPhone(property)

    let eligibilityStatus = 'eligible'
    let eligibilityReason: string | null = null

    if (!destination) {
      eligibilityStatus = 'missing_destination'
      eligibilityReason = campaign.channel === 'email' ? 'No email address found.' : 'No phone number found.'
    }

    const suppressionSet =
      suppressionsByChannel.get(campaign.channel) || suppressionsByChannel.get('all')

    if (destination && suppressionSet?.has(destination)) {
      eligibilityStatus = 'suppressed'
      eligibilityReason = 'Destination is globally suppressed.'
    }

    return {
      property_id: property.id,
      contact_id: contact?.id || null,
      latest_channel: campaign.channel,
      destination,
      review_state: 'review_required',
      delivery_status: eligibilityStatus === 'eligible' ? 'queued' : 'suppressed',
      eligibility_status: eligibilityStatus,
      eligibility_reason: eligibilityReason,
      source_type: campaign.audience_source_type || 'property',
      source_id: campaign.audience_source_id || property.id,
      meta: {
        propertyAddress: property.address,
        propertyCity: property.city,
        propertyState: property.state,
        contactName: contact?.name || property.owner_name,
      },
    }
  })

  return {
    audienceCount: audience.length,
    reviewRows,
    counts: {
      eligible: reviewRows.filter((row) => row.eligibility_status === 'eligible').length,
      suppressed: reviewRows.filter((row) => row.eligibility_status === 'suppressed').length,
      missingDestination: reviewRows.filter((row) => row.eligibility_status === 'missing_destination').length,
    },
  }
}

export async function listUnifiedMarketingEvents(ownerUserId: string) {
  const supabase = createAdminClient()

  const [messages, calls, emails, notes, activity] = await Promise.all([
    safeSelect(
      'messages',
      supabase
        .from('messages')
        .select('id, body, direction, status, created_at, from_number, to_number, property_id, contact_id')
        .eq('user_id', ownerUserId)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    safeSelect(
      'calls',
      supabase
        .from('calls')
        .select('id, status, notes, created_at, to_number, from_number, property_id, contact_id, recording_url, transcript')
        .eq('caller_id', ownerUserId)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    safeSelect(
      'communication logs',
      supabase
        .from('communication_logs')
        .select('id, type, direction, subject, content, status, created_at, property_id, recipient')
        .eq('user_id', ownerUserId)
        .order('created_at', { ascending: false })
        .limit(100)
    ),
    safeSelect(
      'notes',
      supabase
        .from('notes')
        .select('id, content, created_at, property_id')
        .eq('user_id', ownerUserId)
        .order('created_at', { ascending: false })
        .limit(50)
    ),
    safeSelect(
      'activity log',
      supabase
        .from('activity_log')
        .select('id, action, old_value, new_value, created_at, property_id')
        .eq('user_id', ownerUserId)
        .order('created_at', { ascending: false })
        .limit(50)
    ),
  ])

  const smsEvents = messages.map((message) => {
    const destination =
      (message as { direction?: string }).direction === 'inbound'
        ? (message as { from_number?: string | null }).from_number || null
        : (message as { to_number?: string | null }).to_number || null

    return {
      id: (message as { id: string }).id,
      type: 'sms',
      channel: 'sms',
      direction:
        (message as { direction?: 'inbound' | 'outbound' }).direction || 'outbound',
      status: (message as { status?: string }).status || 'sent',
      title: 'SMS',
      content: (message as { body?: string }).body || '',
      createdAt: (message as { created_at: string }).created_at,
      propertyId: (message as { property_id?: string | null }).property_id || null,
      contactId: (message as { contact_id?: string | null }).contact_id || null,
      destination,
    } satisfies Omit<MarketingUnifiedEvent, 'threadKey'>
  })

  const emailEvents = emails.map((email) => ({
    id: (email as { id: string }).id,
    type: 'email',
    channel: 'email',
    direction:
      ((email as { direction?: string }).direction as 'inbound' | 'outbound' | undefined) || 'outbound',
    status: (email as { status?: string }).status || 'sent',
    title: (email as { subject?: string | null }).subject || 'Email',
    content: (email as { content?: string | null }).content || '',
    createdAt: (email as { created_at: string }).created_at,
    propertyId: (email as { property_id?: string | null }).property_id || null,
    contactId: null,
    destination: normalizeEmail((email as { recipient?: string | null }).recipient || null),
  }) satisfies Omit<MarketingUnifiedEvent, 'threadKey'>)

  const callEvents = calls.map((call) => {
    const status = (call as { status?: string | null }).status || 'completed'
    const type = status === 'voicemail_left' ? 'voicemail' : 'voice'

    return {
      id: (call as { id: string }).id,
      type,
      channel: 'voice',
      direction: 'outbound',
      status,
      title: type === 'voicemail' ? 'Voicemail' : 'Voice',
      content: (call as { notes?: string | null }).notes || (call as { transcript?: string | null }).transcript || '',
      createdAt: (call as { created_at: string }).created_at,
      propertyId: (call as { property_id?: string | null }).property_id || null,
      contactId: (call as { contact_id?: string | null }).contact_id || null,
      destination: normalizePhoneNumber((call as { to_number?: string | null }).to_number || '') || null,
      meta: {
        recordingUrl: (call as { recording_url?: string | null }).recording_url || null,
      },
    } satisfies Omit<MarketingUnifiedEvent, 'threadKey'>
  })

  const noteEvents = notes.map((note) => ({
    id: (note as { id: string }).id,
    type: 'note',
    channel: 'note',
    direction: 'internal',
    status: 'logged',
    title: 'Note',
    content: (note as { content?: string }).content || '',
    createdAt: (note as { created_at: string }).created_at,
    propertyId: (note as { property_id?: string | null }).property_id || null,
    contactId: null,
    destination: null,
  }) satisfies Omit<MarketingUnifiedEvent, 'threadKey'>)

  const activityEvents = activity.map((entry) => ({
    id: (entry as { id: string }).id,
    type: 'activity',
    channel: 'activity',
    direction: 'internal',
    status: 'logged',
    title: 'Activity',
    content: [
      (entry as { action?: string | null }).action || 'Updated record',
      (entry as { old_value?: string | null }).old_value ? `from ${(entry as { old_value?: string | null }).old_value}` : null,
      (entry as { new_value?: string | null }).new_value ? `to ${(entry as { new_value?: string | null }).new_value}` : null,
    ].filter(Boolean).join(' '),
    createdAt: (entry as { created_at: string }).created_at,
    propertyId: (entry as { property_id?: string | null }).property_id || null,
    contactId: null,
    destination: null,
  }) satisfies Omit<MarketingUnifiedEvent, 'threadKey'>)

  return [...smsEvents, ...emailEvents, ...callEvents, ...noteEvents, ...activityEvents]
    .map((event) => ({
      ...event,
      threadKey: threadKeyForEvent({
        channel: event.channel,
        contactId: event.contactId,
        propertyId: event.propertyId,
        destination: event.destination,
      }),
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()) as MarketingUnifiedEvent[]
}

export function buildMarketingThreads(events: MarketingUnifiedEvent[]) {
  const threads = new Map<string, MarketingThreadSummary>()

  for (const event of events) {
    const existing = threads.get(event.threadKey)
    const needsReply = event.direction === 'inbound' && (event.channel === 'sms' || event.channel === 'email')
    const currentChannel =
      event.channel === 'note' || event.channel === 'activity' ? 'mixed' : event.channel
    const nextChannel =
      existing && existing.channel !== currentChannel && existing.channel !== 'mixed'
        ? 'mixed'
        : (existing?.channel || currentChannel)

    if (!existing) {
      threads.set(event.threadKey, {
        id: event.threadKey,
        title: event.title,
        channel: currentChannel,
        status: event.status,
        preview: event.content,
        lastEventAt: event.createdAt,
        unreadCount: needsReply ? 1 : 0,
        needsReply,
        propertyId: event.propertyId,
        contactId: event.contactId,
        eventCount: 1,
      })
      continue
    }

    threads.set(event.threadKey, {
      ...existing,
      channel: nextChannel as MarketingThreadSummary['channel'],
      preview: existing.preview || event.content,
      unreadCount: existing.unreadCount + (needsReply ? 1 : 0),
      needsReply: existing.needsReply || needsReply,
      eventCount: existing.eventCount + 1,
    })
  }

  return Array.from(threads.values()).sort(
    (left, right) => new Date(right.lastEventAt).getTime() - new Date(left.lastEventAt).getTime()
  )
}

export async function buildMarketingAnalytics(ownerUserId: string) {
  const supabase = createAdminClient()
  const events = await listUnifiedMarketingEvents(ownerUserId)
  const enrollments = await safeSelect(
    'analytics enrollments',
    supabase
      .from('campaign_enrollments')
      .select('delivery_status, eligibility_status')
      .in('campaign_id', (await listOwnedCampaigns(ownerUserId)).map((campaign) => campaign.id))
  )

  const counts = {
    sent: 0,
    delivered: 0,
    replied: 0,
    answered: 0,
    voicemail_left: 0,
    failed: 0,
    converted: 0,
  }

  for (const event of events) {
    if (event.status === 'sent') counts.sent += 1
    if (event.status === 'delivered') counts.delivered += 1
    if (event.status === 'replied' || event.direction === 'inbound') counts.replied += 1
    if (event.status === 'answered') counts.answered += 1
    if (event.status === 'voicemail_left') counts.voicemail_left += 1
    if (event.status === 'failed' || event.status === 'bounced') counts.failed += 1
  }

  for (const enrollment of enrollments) {
    if ((enrollment as { eligibility_status?: string }).eligibility_status === 'converted') {
      counts.converted += 1
    }
  }

  return counts
}
