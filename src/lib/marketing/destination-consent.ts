import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhoneNumber } from '@/lib/utils'
import { normalizeEmailAddress } from '@/lib/marketing/communications'
import { actorHasTeamScope, resolveMarketingActor } from '@/lib/marketing/actor'

export type ConsentStatus = 'granted' | 'denied' | 'unknown'
export type ConsentSource =
  | 'import'
  | 'manual'
  | 'sms_keyword'
  | 'email_webhook'
  | 'legacy'
  | 'system'

export type DestinationChannel = 'sms' | 'email'

export type DestinationEntry = {
  value: string
  label: string
  is_primary: boolean
  consent_status: ConsentStatus
  consent_source: ConsentSource
  consent_updated_at: string | null
  consent_note: string | null
}

export type DestinationConsent = Pick<
  DestinationEntry,
  'consent_status' | 'consent_source' | 'consent_updated_at' | 'consent_note'
>

type ImportRow = Record<string, string | undefined>

type NormalizedContactRow = {
  phone_numbers?: unknown[] | null
  emails?: unknown[] | null
}

const CONSENT_STATUS_TOKENS: Record<ConsentStatus, Set<string>> = {
  granted: new Set([
    '1',
    'true',
    'yes',
    'y',
    'ok',
    'okay',
    'optin',
    'optedin',
    'subscribed',
    'consented',
    'allowed',
    'grant',
    'granted',
  ]),
  denied: new Set([
    '0',
    'false',
    'no',
    'n',
    'optout',
    'optedout',
    'unsubscribe',
    'unsubscribed',
    'unsubscribedfrommarketing',
    'stop',
    'stopall',
    'cancel',
    'end',
    'quit',
    'dnc',
    'donotcall',
    'donotemail',
    'donottext',
    'blocked',
    'suppressed',
    'denied',
  ]),
  unknown: new Set(['', 'unknown', 'undetermined', 'pending', 'na', 'n/a']),
}

function coerceString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function buildRowLookup(row: ImportRow) {
  const lookup = new Map<string, { key: string; value: string }>()

  for (const [key, value] of Object.entries(row)) {
    const trimmed = coerceString(value)
    if (!trimmed) continue

    const normalizedKey = normalizeLookupKey(key)
    if (!lookup.has(normalizedKey)) {
      lookup.set(normalizedKey, { key, value: trimmed })
    }
  }

  return lookup
}

function getRowValue(row: ImportRow, keys: string[]) {
  const lookup = buildRowLookup(row)

  for (const key of keys) {
    const match = lookup.get(normalizeLookupKey(key))
    if (match) {
      return match
    }
  }

  return null
}

function parseBooleanish(value: string | null | undefined) {
  const normalized = normalizeLookupKey(value || '')

  if (['1', 'true', 'yes', 'y', 'on', 'checked', 'enabled'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'n', 'off', 'unchecked', 'disabled'].includes(normalized)) {
    return false
  }

  return null
}

function parseConsentStatus(value: string | null | undefined): ConsentStatus {
  const normalized = normalizeLookupKey(value || '')

  if (CONSENT_STATUS_TOKENS.granted.has(normalized)) {
    return 'granted'
  }

  if (CONSENT_STATUS_TOKENS.denied.has(normalized)) {
    return 'denied'
  }

  return 'unknown'
}

function normalizeConsentSource(value: string | null | undefined, fallback: ConsentSource): ConsentSource {
  const normalized = normalizeLookupKey(value || '')

  if (normalized === 'smskeyword') {
    return 'sms_keyword'
  }

  if (normalized === 'emailwebhook') {
    return 'email_webhook'
  }

  if (
    normalized === 'import' ||
    normalized === 'manual' ||
    normalized === 'legacy' ||
    normalized === 'system'
  ) {
    return normalized as ConsentSource
  }

  return fallback
}

function parseConsentUpdatedAt(value: string | null | undefined) {
  const trimmed = coerceString(value)
  if (!trimmed) return null

  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString()
  }

  return trimmed
}

function normalizeChannelValue(channel: DestinationChannel, value: string) {
  return channel === 'email' ? normalizeEmailAddress(value) : normalizePhoneNumber(value)
}

function inferEntryValue(entry: unknown, channel: DestinationChannel) {
  if (typeof entry === 'string') {
    return coerceString(entry)
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return ''
  }

  const record = entry as Record<string, unknown>
  const direct =
    typeof record.value === 'string'
      ? record.value
      : channel === 'email' && typeof record.email === 'string'
        ? record.email
        : channel === 'sms' && typeof record.phone === 'string'
          ? record.phone
          : ''

  return coerceString(direct)
}

function readConsentFromEntry(
  entry: unknown,
  channel: DestinationChannel,
  fallbackSource: ConsentSource,
  fallbackIndex: number
): DestinationEntry {
  const value = inferEntryValue(entry, channel)
  const defaultLabel = channel === 'email' ? 'personal' : 'mobile'

  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const record = entry as Record<string, unknown>
    const consentStatusRaw =
      typeof record.consent_status === 'string'
        ? record.consent_status
        : typeof record.consentStatus === 'string'
          ? record.consentStatus
          : null
    const consentSourceRaw =
      typeof record.consent_source === 'string'
        ? record.consent_source
        : typeof record.consentSource === 'string'
          ? record.consentSource
          : null
    const consentUpdatedAtRaw =
      typeof record.consent_updated_at === 'string'
        ? record.consent_updated_at
        : typeof record.consentUpdatedAt === 'string'
          ? record.consentUpdatedAt
          : null
    const consentNoteRaw =
      typeof record.consent_note === 'string'
        ? record.consent_note
        : typeof record.consentNote === 'string'
          ? record.consentNote
          : null

    return {
      value,
      label:
        typeof record.label === 'string' && record.label.trim()
          ? record.label.trim()
          : defaultLabel,
      is_primary:
        typeof record.is_primary === 'boolean'
          ? record.is_primary
          : typeof record.isPrimary === 'boolean'
            ? record.isPrimary
            : fallbackIndex === 0,
      consent_status: parseConsentStatus(consentStatusRaw),
      consent_source: normalizeConsentSource(consentSourceRaw, fallbackSource),
      consent_updated_at: parseConsentUpdatedAt(consentUpdatedAtRaw),
      consent_note: consentNoteRaw?.trim() || null,
    }
  }

  return {
    value,
    label: defaultLabel,
    is_primary: fallbackIndex === 0,
    consent_status: 'unknown',
    consent_source: fallbackSource,
    consent_updated_at: null,
    consent_note: null,
  }
}

export function createDestinationEntry(params: {
  channel: DestinationChannel
  value: string
  label?: string | null
  isPrimary?: boolean
  consent?: Partial<DestinationConsent>
  defaultConsentSource?: ConsentSource
  defaultConsentUpdatedAt?: string | null
}) {
  const normalizedValue = coerceString(params.value)
  const defaultLabel = params.channel === 'email' ? 'personal' : 'mobile'

  return {
    value: normalizedValue,
    label: params.label?.trim() || defaultLabel,
    is_primary: params.isPrimary ?? false,
    consent_status: params.consent?.consent_status || 'unknown',
    consent_source: params.consent?.consent_source || params.defaultConsentSource || 'manual',
    consent_updated_at:
      params.consent?.consent_updated_at === undefined
        ? params.defaultConsentUpdatedAt ?? new Date().toISOString()
        : params.consent.consent_updated_at,
    consent_note: params.consent?.consent_note ?? null,
  } satisfies DestinationEntry
}

export function normalizeDestinationEntries(
  rawEntries: unknown,
  channel: DestinationChannel,
  options: { defaultConsentSource?: ConsentSource } = {}
) {
  const entries = Array.isArray(rawEntries) ? rawEntries : []
  return entries
    .map((entry, index) =>
      readConsentFromEntry(entry, channel, options.defaultConsentSource || 'legacy', index)
    )
    .filter((entry) => Boolean(entry.value))
}

export function normalizeContactRecord<T extends NormalizedContactRow>(contact: T) {
  return {
    ...contact,
    phone_numbers: normalizeDestinationEntries(contact.phone_numbers, 'sms'),
    emails: normalizeDestinationEntries(contact.emails, 'email'),
  }
}

function getConsentColumnMatch(row: ImportRow, channel: DestinationChannel) {
  const prefixes =
    channel === 'sms'
      ? ['sms', 'phone', 'mobile', 'cell', 'text']
      : ['email']

  const statusMatch = getRowValue(
    row,
    prefixes.flatMap((prefix) => [
      `${prefix}_consent`,
      `${prefix}_consent_status`,
      `${prefix}_permission`,
      `${prefix}_permission_status`,
      `${prefix}_opt_in`,
      `${prefix}_subscribed`,
    ])
  )

  const sourceMatch = getRowValue(
    row,
    prefixes.flatMap((prefix) => [
      `${prefix}_consent_source`,
      `${prefix}_consent_method`,
      `${prefix}_permission_source`,
      `${prefix}_permission_method`,
    ])
  )

  const updatedAtMatch = getRowValue(
    row,
    prefixes.flatMap((prefix) => [
      `${prefix}_consent_date`,
      `${prefix}_consent_updated_at`,
      `${prefix}_permission_date`,
      `${prefix}_permission_updated_at`,
    ])
  )

  const noteMatch = getRowValue(
    row,
    prefixes.flatMap((prefix) => [
      `${prefix}_consent_note`,
      `${prefix}_consent_reason`,
      `${prefix}_permission_note`,
      `${prefix}_permission_reason`,
    ])
  )

  const deniedMatch = getRowValue(
    row,
    prefixes.flatMap((prefix) => [
      `${prefix}_opt_out`,
      `${prefix}_unsubscribed`,
      `${prefix}_unsubscribe`,
      `${prefix}_do_not_call`,
      `${prefix}_dnc`,
      `${prefix}_blocked`,
      `${prefix}_suppressed`,
    ]).concat(
      channel === 'sms'
        ? ['do_not_call', 'dnc', 'sms_stop', 'text_stop', 'text_unsubscribed', 'phone_dnc', 'cell_dnc']
        : ['do_not_email', 'dne', 'unsubscribe', 'email_dnc', 'email_unsubscribed']
    )
  )

  const grantedMatch = getRowValue(
    row,
    prefixes.flatMap((prefix) => [
      `${prefix}_opt_in`,
      `${prefix}_subscribed`,
      `${prefix}_consented`,
      `${prefix}_granted`,
      `${prefix}_allowed`,
    ])
  )

  return {
    status: statusMatch?.value || null,
    statusSourceKey: statusMatch?.key || null,
    source: sourceMatch?.value || null,
    updatedAt: updatedAtMatch?.value || null,
    note: noteMatch?.value || null,
    denied: deniedMatch?.value || null,
    deniedSourceKey: deniedMatch?.key || null,
    granted: grantedMatch?.value || null,
  }
}

export function buildConsentMetadataFromImportRow(
  row: ImportRow,
  channel: DestinationChannel,
  defaultUpdatedAt: string | null = null
): DestinationConsent {
  const match = getConsentColumnMatch(row, channel)

  let consentStatus = parseConsentStatus(match.status)
  const deniedFlag = parseBooleanish(match.denied)
  const grantedFlag = parseBooleanish(match.granted)

  if (deniedFlag === true) {
    consentStatus = 'denied'
  } else if (consentStatus === 'unknown' && grantedFlag === true) {
    consentStatus = 'granted'
  }

  const source = normalizeConsentSource(match.source, 'import')
  const noteParts: string[] = []

  if (match.note) {
    noteParts.push(match.note)
  }

  if (match.statusSourceKey) {
    noteParts.push(`status column: ${match.statusSourceKey}`)
  }

  if (match.deniedSourceKey && deniedFlag === true) {
    noteParts.push(`denied column: ${match.deniedSourceKey}`)
  }

  return {
    consent_status: consentStatus,
    consent_source: source,
    consent_updated_at: parseConsentUpdatedAt(match.updatedAt) || defaultUpdatedAt,
    consent_note: noteParts.length > 0 ? noteParts.join(' | ') : null,
  }
}

export function consentMetadataFromFields(fields: {
  consent_status?: string | null
  consent_source?: string | null
  consent_updated_at?: string | null
  consent_note?: string | null
}, fallbackSource: ConsentSource, defaultUpdatedAt: string | null = null) {
  const explicitUpdatedAt = fields.consent_updated_at
  return {
    consent_status: parseConsentStatus(fields.consent_status),
    consent_source: normalizeConsentSource(fields.consent_source, fallbackSource),
    consent_updated_at:
      explicitUpdatedAt === undefined
        ? defaultUpdatedAt
        : parseConsentUpdatedAt(explicitUpdatedAt),
    consent_note: coerceString(fields.consent_note) || null,
  } satisfies DestinationConsent
}

export type DestinationConsentCheck = {
  allowed: boolean
  reason: 'missing_consent' | 'denied' | 'missing_destination' | 'unavailable'
  matchedEntry: DestinationEntry | null
  matchedContactId: string | null
  matchedPropertyId: string | null
}

async function loadAccessibleContactRows(params: {
  supabase: ReturnType<typeof createAdminClient>
  actorUserId: string
  contactId?: string | null
  propertyId?: string | null
}) {
  const { supabase, actorUserId, contactId, propertyId } = params

  if (contactId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, property_id, phone_numbers, emails')
      .eq('id', contactId)
      .maybeSingle()

    if (error) {
      throw error
    }

    return data ? [data as { id: string; property_id: string; phone_numbers: unknown[] | null; emails: unknown[] | null }] : []
  }

  if (propertyId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, property_id, phone_numbers, emails')
      .eq('property_id', propertyId)

    if (error) {
      throw error
    }

    return (data || []) as Array<{
      id: string
      property_id: string
      phone_numbers: unknown[] | null
      emails: unknown[] | null
    }>
  }

  const actor = await resolveMarketingActor(actorUserId, { supabase })
  let propertiesQuery = supabase.from('properties').select('id')

  if (actorHasTeamScope(actor) && actor.teamId) {
    propertiesQuery = propertiesQuery.or(
      `created_by.eq.${actor.id},team_id.eq.${actor.teamId}`
    )
  } else {
    propertiesQuery = propertiesQuery.eq('created_by', actor.id)
  }

  const { data: properties, error: propertiesError } = await propertiesQuery

  if (propertiesError) {
    throw propertiesError
  }

  const propertyIds = (properties || []).map((property) => property.id)
  if (!propertyIds.length) {
    return []
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('id, property_id, phone_numbers, emails')
    .in('property_id', propertyIds)

  if (error) {
    throw error
  }

  return (data || []) as Array<{
    id: string
    property_id: string
    phone_numbers: unknown[] | null
    emails: unknown[] | null
  }>
}

export async function evaluateDestinationConsent(params: {
  supabase?: ReturnType<typeof createAdminClient>
  ownerUserId: string
  channel: DestinationChannel
  destination: string
  contactId?: string | null
  propertyId?: string | null
}) {
  const supabase = params.supabase ?? createAdminClient()
  const destination = normalizeChannelValue(params.channel, params.destination)

  if (!destination) {
    return {
      allowed: false,
      reason: 'missing_destination' as const,
      matchedEntry: null,
      matchedContactId: null,
      matchedPropertyId: null,
    }
  }

  try {
    const contactRows = await loadAccessibleContactRows({
      supabase,
      actorUserId: params.ownerUserId,
      contactId: params.contactId || null,
      propertyId: params.propertyId || null,
    })

    let grantedMatch: {
      entry: DestinationEntry
      contactId: string
      propertyId: string
    } | null = null
    let unknownMatch: {
      entry: DestinationEntry
      contactId: string
      propertyId: string
    } | null = null

    for (const contact of contactRows) {
      const entries =
        params.channel === 'email'
          ? normalizeDestinationEntries(contact.emails, 'email')
          : normalizeDestinationEntries(contact.phone_numbers, 'sms')

      for (const entry of entries) {
        const normalizedValue = normalizeChannelValue(params.channel, entry.value)
        if (!normalizedValue || normalizedValue !== destination) {
          continue
        }

        if (entry.consent_status === 'denied') {
          return {
            allowed: false,
            reason: 'denied' as const,
            matchedEntry: entry,
            matchedContactId: contact.id,
            matchedPropertyId: contact.property_id,
          }
        }

        if (entry.consent_status === 'granted' && !grantedMatch) {
          grantedMatch = {
            entry,
            contactId: contact.id,
            propertyId: contact.property_id,
          }
        }

        if (entry.consent_status === 'unknown' && !unknownMatch) {
          unknownMatch = {
            entry,
            contactId: contact.id,
            propertyId: contact.property_id,
          }
        }
      }
    }

    if (grantedMatch) {
      return {
        allowed: true,
        reason: null,
        matchedEntry: grantedMatch.entry,
        matchedContactId: grantedMatch.contactId,
        matchedPropertyId: grantedMatch.propertyId,
      }
    }

    const matched = unknownMatch || null
    return {
      allowed: false,
      reason: 'missing_consent' as const,
      matchedEntry: matched?.entry || null,
      matchedContactId: matched?.contactId || null,
      matchedPropertyId: matched?.propertyId || null,
    }
  } catch (error) {
    console.error('Consent lookup error:', error)
    return {
      allowed: false,
      reason: 'unavailable' as const,
      matchedEntry: null,
      matchedContactId: null,
      matchedPropertyId: null,
    }
  }
}
