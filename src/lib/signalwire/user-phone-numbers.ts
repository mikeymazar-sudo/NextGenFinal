import { RestClient } from '@/lib/signalwire/compatibility-api'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhoneNumber } from '@/lib/utils'
import { getSignalWireEnv } from '@/lib/signalwire/config'
import {
  findSignalWireOutboundAddressId,
  type SignalWireAddress,
} from '@/lib/signalwire/shared'

type ProvisioningStatus = 'pending' | 'provisioning' | 'active' | 'failed' | 'released'
type VoiceRoutingStatus = 'pending' | 'active' | 'failed'

export interface UserPhoneNumberRecord {
  id: string
  user_id: string
  phone_number: string | null
  provider: string
  signalwire_incoming_phone_number_sid: string | null
  signalwire_subscriber_id: string | null
  signalwire_address_id: string | null
  provisioning_status: ProvisioningStatus
  voice_routing_status: VoiceRoutingStatus
  assignment_source: 'auto' | 'manual'
  friendly_name: string | null
  provisioning_error: string | null
  voice_routing_error: string | null
  assigned_at: string | null
  released_at: string | null
  last_provisioning_attempt_at: string | null
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

interface SignalWireSubscriberInfo {
  id: string
  fabric_addresses: SignalWireAddress[]
}

interface SignalWireSubscriberSession extends SignalWireSubscriberInfo {
  token: string
}

interface SignalWireProjectPhoneNumber {
  id: string
  name?: string | null
  number: string
  capabilities?: string[]
}

interface EnsureUserPhoneNumberOptions {
  userId: string
  userEmail?: string | null
  fullName?: string | null
  request?: Request
}

const PROVISIONING_POLL_INTERVAL_MS = 1000
const PROVISIONING_POLL_TIMEOUT_MS = 30000
const DEFAULT_COUNTRY_CODE = 'US'

function cleanOptionalEnv(value: string | undefined | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed || null
}

function getSignalWireAdminConfig() {
  const { apiToken, projectId, spaceHost, fabricHost } = getSignalWireEnv()

  if (!apiToken || !projectId || !spaceHost || !fabricHost) {
    throw new Error(
      'SignalWire admin configuration is incomplete. Set SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, and SIGNALWIRE_SPACE_URL.'
    )
  }

  return { apiToken, projectId, spaceHost, fabricHost }
}

function getSignalWireRestClient() {
  const { apiToken, projectId, spaceHost } = getSignalWireAdminConfig()

  return RestClient(projectId, apiToken, {
    signalwireSpaceUrl: spaceHost,
  })
}

function getSignalWireNumberCountry() {
  return cleanOptionalEnv(process.env.SIGNALWIRE_NUMBER_COUNTRY)?.toUpperCase() || DEFAULT_COUNTRY_CODE
}

function getSignalWireNumberAreaCode() {
  const areaCode = cleanOptionalEnv(process.env.SIGNALWIRE_NUMBER_AREA_CODE)
  if (!areaCode) return null

  const digits = areaCode.replace(/\D/g, '')
  return digits.length >= 3 ? Number(digits.slice(0, 3)) : null
}

function getAppBaseUrl(request?: Request) {
  const configured =
    cleanOptionalEnv(process.env.NEXT_PUBLIC_APP_URL) ||
    cleanOptionalEnv(process.env.APP_URL) ||
    cleanOptionalEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    cleanOptionalEnv(process.env.VERCEL_URL)

  if (configured) {
    const withProtocol = configured.startsWith('http')
      ? configured
      : `https://${configured}`

    return withProtocol.replace(/\/+$/, '')
  }

  if (request?.url) {
    return new URL(request.url).origin.replace(/\/+$/, '')
  }

  throw new Error(
    'Unable to determine the app base URL. Set NEXT_PUBLIC_APP_URL or APP_URL.'
  )
}

function buildFriendlyName(userId: string, fullName?: string | null, userEmail?: string | null) {
  const preferred =
    cleanOptionalEnv(fullName) ||
    cleanOptionalEnv(userEmail)?.split('@')[0] ||
    `User ${userId.slice(0, 8)}`

  return `NextGen ${preferred}`.slice(0, 64)
}

function getBasicAuthHeader(projectId: string, apiToken: string) {
  return `Basic ${Buffer.from(`${projectId}:${apiToken}`).toString('base64')}`
}

function getConfiguredExistingPhoneNumber() {
  const { phoneNumber, subscriberReference } = getSignalWireEnv()

  if (subscriberReference) {
    return null
  }

  return phoneNumber ? normalizePhoneNumber(phoneNumber) : null
}

async function fetchUserPhoneNumber(userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_phone_numbers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to fetch user phone number: ${error.message}`)
  }

  return (data as UserPhoneNumberRecord | null) ?? null
}

async function updateUserPhoneNumber(
  id: string,
  updates: Partial<UserPhoneNumberRecord>
) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_phone_numbers')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to update user phone number: ${error.message}`)
  }

  return data as UserPhoneNumberRecord
}

async function waitForProvisionedPhoneNumber(userId: string) {
  const deadline = Date.now() + PROVISIONING_POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const row = await fetchUserPhoneNumber(userId)

    if (row?.provisioning_status === 'active' && row.phone_number) {
      return syncVoiceRoutingSafely(row)
    }

    if (row?.provisioning_status === 'failed') {
      throw new Error(
        row.provisioning_error || 'Dedicated phone number provisioning failed.'
      )
    }

    await new Promise((resolve) =>
      setTimeout(resolve, PROVISIONING_POLL_INTERVAL_MS)
    )
  }

  throw new Error('Timed out waiting for dedicated phone number provisioning.')
}

async function createSubscriberSessionByReference(
  reference: string
): Promise<SignalWireSubscriberSession> {
  const { apiToken, projectId, spaceHost, fabricHost } = getSignalWireAdminConfig()

  const tokenResponse = await fetch(
    `https://${spaceHost}/api/fabric/subscribers/tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(projectId, apiToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reference }),
    }
  )

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text()
    throw new Error(
      `SignalWire subscriber token error (${tokenResponse.status}): ${text}`
    )
  }

  const tokenPayload = (await tokenResponse.json()) as { token?: string }
  if (!tokenPayload.token) {
    throw new Error('SignalWire did not return a subscriber token.')
  }

  const subscriberResponse = await fetch(
    `https://${fabricHost}/api/fabric/subscriber/info`,
    {
      headers: {
        Authorization: `Bearer ${tokenPayload.token}`,
      },
    }
  )

  if (!subscriberResponse.ok) {
    const text = await subscriberResponse.text()
    throw new Error(
      `SignalWire subscriber lookup error (${subscriberResponse.status}): ${text}`
    )
  }

  const subscriber = (await subscriberResponse.json()) as SignalWireSubscriberInfo

  return {
    id: subscriber.id,
    token: tokenPayload.token,
    fabric_addresses: subscriber.fabric_addresses || [],
  }
}

export async function resolveSignalWireOutboundAddressIdForToken(
  token: string,
  phoneNumber: string,
  preferredAddresses: SignalWireAddress[] = []
) {
  const fromPreferred = findSignalWireOutboundAddressId(preferredAddresses, phoneNumber)
  if (fromPreferred) {
    return fromPreferred
  }

  const { fabricHost } = getSignalWireAdminConfig()
  const addressesResponse = await fetch(
    `https://${fabricHost}/api/fabric/addresses?page_size=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!addressesResponse.ok) {
    const text = await addressesResponse.text()
    throw new Error(
      `SignalWire addresses lookup error (${addressesResponse.status}): ${text}`
    )
  }

  const addressesPayload = (await addressesResponse.json()) as {
    data?: SignalWireAddress[]
  }

  return findSignalWireOutboundAddressId(addressesPayload.data || [], phoneNumber)
}

interface SignalWirePhoneRoute {
  id: string
  name?: string
  phone_number?: string
  number?: string
}

async function findPhoneRouteForNumber(phoneNumber: string) {
  const { apiToken, projectId, spaceHost } = getSignalWireAdminConfig()
  const normalizedPhone = normalizePhoneNumber(phoneNumber)

  const response = await fetch(
    `https://${spaceHost}/api/fabric/phone_routes?page_size=100`,
    {
      headers: {
        Authorization: getBasicAuthHeader(projectId, apiToken),
      },
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `SignalWire phone routes lookup failed (${response.status}): ${text}`
    )
  }

  const payload = (await response.json()) as {
    data?: SignalWirePhoneRoute[]
  }

  const routes = payload.data || []
  return routes.find((route) => {
    const routeNumber =
      normalizePhoneNumber(route.phone_number || '') ||
      normalizePhoneNumber(route.number || '') ||
      normalizePhoneNumber(route.name || '')
    return routeNumber === normalizedPhone
  }) || null
}

async function assignPhoneRouteToSubscriber(
  subscriberId: string,
  phoneRouteId: string
) {
  const { apiToken, projectId, spaceHost } = getSignalWireAdminConfig()

  const response = await fetch(
    `https://${spaceHost}/api/fabric/resources/${subscriberId}/phone_routes`,
    {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(projectId, apiToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_route_id: phoneRouteId,
        handler: 'calling',
      }),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `SignalWire phone route assignment failed (${response.status}): ${text}`
    )
  }

  return (await response.json()) as SignalWireAddress
}

async function resolveOutboundAddressForReference(reference: string, phoneNumber: string) {
  const subscriber = await createSubscriberSessionByReference(reference)
  // Only use the subscriber's own fabric_addresses — do NOT fall back to the
  // global address list, because addresses from other subscribers would cause a
  // "from_fabric_address_id_does_not_match_subscriber" error at dial time.
  let addressId = findSignalWireOutboundAddressId(
    subscriber.fabric_addresses,
    phoneNumber
  )

  // If no address exists, assign the phone route to this subscriber
  if (!addressId) {
    try {
      const phoneRoute = await findPhoneRouteForNumber(phoneNumber)
      if (phoneRoute) {
        const assigned = await assignPhoneRouteToSubscriber(
          subscriber.id,
          phoneRoute.id
        )
        addressId = assigned.id || null
        console.log('[SignalWire] Assigned phone route to subscriber:', {
          subscriberId: subscriber.id,
          phoneRouteId: phoneRoute.id,
          addressId,
        })
      } else {
        console.warn('[SignalWire] No phone route found for number:', phoneNumber)
      }
    } catch (error) {
      console.error('[SignalWire] Failed to assign phone route to subscriber:', error)
    }
  }

  return {
    subscriberId: subscriber.id,
    addressId,
  }
}

async function fetchProjectPhoneNumbers() {
  const { apiToken, projectId, spaceHost } = getSignalWireAdminConfig()
  const response = await fetch(
    `https://${spaceHost}/api/relay/rest/phone_numbers?page_size=100`,
    {
      headers: {
        Authorization: getBasicAuthHeader(projectId, apiToken),
      },
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `SignalWire phone number lookup error (${response.status}): ${text}`
    )
  }

  const payload = (await response.json()) as {
    data?: SignalWireProjectPhoneNumber[]
  }

  return payload.data || []
}

async function findProjectPhoneNumber(phoneNumber: string) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber)
  if (!normalizedPhone) {
    return null
  }

  const numbers = await fetchProjectPhoneNumbers()
  return (
    numbers.find(
      (entry) => normalizePhoneNumber(entry.number) === normalizedPhone
    ) || null
  )
}

async function syncVoiceRouting(record: UserPhoneNumberRecord) {
  if (!record.phone_number || record.provisioning_status !== 'active') {
    return record
  }

  const resolved = await resolveOutboundAddressForReference(
    record.user_id,
    record.phone_number
  )

  const nextVoiceStatus: VoiceRoutingStatus = resolved.addressId ? 'active' : 'pending'
  const nextVoiceError = resolved.addressId
    ? null
    : 'Dedicated phone number exists, but no SignalWire Fabric audio address could be resolved for this user yet.'

  if (
    record.signalwire_address_id === resolved.addressId &&
    record.signalwire_subscriber_id === resolved.subscriberId &&
    record.voice_routing_status === nextVoiceStatus &&
    record.voice_routing_error === nextVoiceError
  ) {
    return record
  }

  return updateUserPhoneNumber(record.id, {
    signalwire_subscriber_id: resolved.subscriberId,
    signalwire_address_id: resolved.addressId,
    voice_routing_status: nextVoiceStatus,
    voice_routing_error: nextVoiceError,
    last_verified_at: new Date().toISOString(),
  })
}

async function syncVoiceRoutingSafely(record: UserPhoneNumberRecord) {
  try {
    return await syncVoiceRouting(record)
  } catch (error) {
    console.error('Failed to sync SignalWire voice routing:', error)

    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Voice routing sync failed.'

    try {
      return await updateUserPhoneNumber(record.id, {
        signalwire_address_id: null,
        voice_routing_status: 'failed',
        voice_routing_error: message,
        last_verified_at: new Date().toISOString(),
      })
    } catch {
      return record
    }
  }
}

async function findAvailableDedicatedNumber() {
  const country = getSignalWireNumberCountry()
  const areaCode = getSignalWireNumberAreaCode()
  const client = getSignalWireRestClient()
  const countryNumbers = client.availablePhoneNumbers(country)

  const localSearches = [
    {
      voiceEnabled: true,
      smsEnabled: true,
      mmsEnabled: true,
      limit: 1,
      ...(areaCode ? { areaCode } : {}),
    },
    {
      voiceEnabled: true,
      smsEnabled: true,
      limit: 1,
      ...(areaCode ? { areaCode } : {}),
    },
  ]

  for (const search of localSearches) {
    const local = await countryNumbers.local.list(search)
    if (local.length > 0) {
      return local[0]
    }
  }

  if (countryNumbers.tollFree) {
    const tollFree = await countryNumbers.tollFree.list({
      voiceEnabled: true,
      smsEnabled: true,
      limit: 1,
    })

    if (tollFree.length > 0) {
      return tollFree[0]
    }
  }

  throw new Error(
    `No SignalWire phone numbers with voice + SMS were available in ${country}.`
  )
}

async function provisionDedicatedPhoneNumber({
  userId,
  userEmail,
  fullName,
  request,
}: EnsureUserPhoneNumberOptions) {
  const client = getSignalWireRestClient()
  const baseUrl = getAppBaseUrl(request)
  const now = new Date().toISOString()
  const candidate = await findAvailableDedicatedNumber()
  const friendlyName = buildFriendlyName(userId, fullName, userEmail)

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: candidate.phoneNumber,
    friendlyName,
    smsUrl: `${baseUrl}/api/sms/webhook`,
    smsMethod: 'POST',
    voiceUrl: `${baseUrl}/api/voice/webhook`,
    voiceMethod: 'POST',
  })

  const row = await fetchUserPhoneNumber(userId)
  if (!row) {
    throw new Error('Phone number claim disappeared before provisioning completed.')
  }

  let activeRecord: UserPhoneNumberRecord
  try {
    activeRecord = await updateUserPhoneNumber(row.id, {
      phone_number: purchased.phoneNumber,
      signalwire_incoming_phone_number_sid: purchased.sid,
      provider: 'signalwire',
      provisioning_status: 'active',
      assignment_source: 'auto',
      friendly_name: friendlyName,
      provisioning_error: null,
      assigned_at: now,
      last_provisioning_attempt_at: now,
      last_verified_at: now,
    })
  } catch (error) {
    try {
      await client.incomingPhoneNumbers(purchased.sid).remove()
    } catch (cleanupError) {
      console.error('Failed to release orphaned SignalWire number:', cleanupError)
    }
    throw error
  }

  return syncVoiceRoutingSafely(activeRecord)
}

async function markProvisioningFailed(userId: string, error: string) {
  const row = await fetchUserPhoneNumber(userId)
  if (!row) return

  await updateUserPhoneNumber(row.id, {
    provisioning_status: 'failed',
    provisioning_error: error,
    voice_routing_status: 'failed',
    voice_routing_error: error,
    last_provisioning_attempt_at: new Date().toISOString(),
  })
}

async function claimProvisioningSlot(userId: string) {
  const supabase = createAdminClient()
  const existing = await fetchUserPhoneNumber(userId)

  if (!existing) {
    const { data, error } = await supabase
      .from('user_phone_numbers')
      .insert({
        user_id: userId,
        provisioning_status: 'provisioning',
        voice_routing_status: 'pending',
        assignment_source: 'auto',
        last_provisioning_attempt_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (!error && data) {
      return { record: data as UserPhoneNumberRecord, claimed: true }
    }

    if (error && /duplicate key/i.test(error.message)) {
      const row = await fetchUserPhoneNumber(userId)
      return { record: row, claimed: false }
    }

    if (error) {
      throw new Error(`Failed to create user phone number row: ${error.message}`)
    }
  }

  if (existing?.provisioning_status === 'active' && existing.phone_number) {
    return { record: existing, claimed: false }
  }

  if (existing?.provisioning_status === 'provisioning') {
    return { record: existing, claimed: false }
  }

  if (existing) {
    const { data, error } = await supabase
      .from('user_phone_numbers')
      .update({
        provisioning_status: 'provisioning',
        voice_routing_status: existing.signalwire_address_id ? 'active' : 'pending',
        provisioning_error: null,
        voice_routing_error: null,
        last_provisioning_attempt_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .neq('provisioning_status', 'provisioning')
      .select('*')
      .single()

    if (!error && data) {
      return { record: data as UserPhoneNumberRecord, claimed: true }
    }

    return { record: await fetchUserPhoneNumber(userId), claimed: false }
  }

  return { record: null, claimed: false }
}

export async function canConnectExistingConfiguredPhoneNumber(userId: string) {
  const configuredPhoneNumber = getConfiguredExistingPhoneNumber()
  if (!configuredPhoneNumber) {
    return false
  }

  const currentAssignment = await fetchUserPhoneNumber(userId)
  if (currentAssignment?.phone_number) {
    return false
  }

  const existingOwner = await getUserPhoneNumberByNumber(configuredPhoneNumber)
  return !existingOwner || existingOwner.user_id === userId
}

export async function connectExistingConfiguredPhoneNumberToUser(
  options: EnsureUserPhoneNumberOptions
) {
  const configuredPhoneNumber = getConfiguredExistingPhoneNumber()
  if (!configuredPhoneNumber) {
    throw new Error(
      'No existing SignalWire phone number is configured for manual connection.'
    )
  }

  const existingOwner = await getUserPhoneNumberByNumber(configuredPhoneNumber)
  if (existingOwner && existingOwner.user_id !== options.userId) {
    throw new Error('That SignalWire phone number is already assigned to another user.')
  }

  const projectPhoneNumber = await findProjectPhoneNumber(configuredPhoneNumber)
  if (!projectPhoneNumber) {
    throw new Error(
      'The configured SignalWire phone number was not found in this SignalWire project.'
    )
  }

  if (!projectPhoneNumber.capabilities?.includes('voice')) {
    throw new Error('The configured SignalWire phone number does not support voice.')
  }

  const { record, claimed } = await claimProvisioningSlot(options.userId)

  if (
    record?.phone_number &&
    normalizePhoneNumber(record.phone_number) !== configuredPhoneNumber &&
    record.provisioning_status === 'active'
  ) {
    throw new Error('This account already has a different dedicated phone number.')
  }

  if (!claimed && record?.phone_number === configuredPhoneNumber) {
    return syncVoiceRoutingSafely(record)
  }

  const activeRecord = record || (await fetchUserPhoneNumber(options.userId))
  if (!activeRecord) {
    throw new Error('Unable to claim a phone number slot for this user.')
  }

  const now = new Date().toISOString()
  const friendlyName =
    cleanOptionalEnv(projectPhoneNumber.name) ||
    buildFriendlyName(options.userId, options.fullName, options.userEmail)

  const updated = await updateUserPhoneNumber(activeRecord.id, {
    phone_number: configuredPhoneNumber,
    provider: 'signalwire',
    signalwire_incoming_phone_number_sid:
      activeRecord.signalwire_incoming_phone_number_sid,
    provisioning_status: 'active',
    assignment_source: 'manual',
    friendly_name: friendlyName,
    provisioning_error: null,
    voice_routing_error: null,
    assigned_at: activeRecord.assigned_at || now,
    last_provisioning_attempt_at: now,
    last_verified_at: now,
  })

  return syncVoiceRoutingSafely(updated)
}

export async function getUserPhoneNumberForUser(userId: string) {
  const row = await fetchUserPhoneNumber(userId)
  if (!row) return null

  if (row.provisioning_status === 'active') {
    return syncVoiceRoutingSafely(row)
  }

  return row
}

export async function getUserPhoneNumberByNumber(phoneNumber: string) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber)
  if (!normalizedPhone) return null

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_phone_numbers')
    .select('*')
    .eq('phone_number', normalizedPhone)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to look up phone number owner: ${error.message}`)
  }

  return (data as UserPhoneNumberRecord | null) ?? null
}

export async function ensureUserPhoneNumberForUser(
  options: EnsureUserPhoneNumberOptions
) {
  const { userId } = options

  const { record, claimed } = await claimProvisioningSlot(userId)

  if (!claimed) {
    if (record?.provisioning_status === 'active' && record.phone_number) {
      return syncVoiceRoutingSafely(record)
    }

    return waitForProvisionedPhoneNumber(userId)
  }

  try {
    return await provisionDedicatedPhoneNumber(options)
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Dedicated phone number provisioning failed.'

    await markProvisioningFailed(userId, message)
    throw error
  }
}
