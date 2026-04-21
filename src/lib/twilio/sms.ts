import { RestClient } from '@/lib/signalwire/compatibility-api'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhoneNumber } from '@/lib/utils'
import {
  ensureUserPhoneNumberForUser,
  getUserPhoneNumberByNumber,
  type UserPhoneNumberRecord,
} from '@/lib/signalwire/user-phone-numbers'
import {
  applyInboundSmsSuppressionKeyword,
  normalizeSmsProviderStatus,
} from '@/lib/marketing/communications'
import { checkMarketingSuppression } from '@/lib/marketing/suppression'

function getSignalWireClient() {
  const projectId = process.env.SIGNALWIRE_PROJECT_ID
  const apiToken = process.env.SIGNALWIRE_API_TOKEN
  const spaceUrl = process.env.SIGNALWIRE_SPACE_URL

  if (!projectId || !apiToken || !spaceUrl) {
    throw new Error('Missing SignalWire credentials in environment variables')
  }

  return RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl })
}

function buildStatusCallbackUrl(request?: Request) {
  if (!request?.url) return undefined
  return new URL('/api/sms/status', request.url).toString()
}

function phoneEntryMatches(value: unknown, targetPhone: string) {
  if (typeof value === 'string') {
    return normalizePhoneNumber(value) === targetPhone
  }

  if (value && typeof value === 'object') {
    const maybePhone = value as { value?: string }
    return normalizePhoneNumber(maybePhone.value || '') === targetPhone
  }

  return false
}

async function findContactByPhoneNumber(userId: string, phoneNumber: string) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber)
  if (!normalizedPhone) return null

  const supabase = createAdminClient()
  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('id')
    .eq('created_by', userId)

  if (propertiesError) {
    throw new Error(`Failed to load user properties: ${propertiesError.message}`)
  }

  const propertyIds = (properties || []).map((property) => property.id)
  if (!propertyIds.length) return null

  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, property_id, phone_numbers')
    .in('property_id', propertyIds)

  if (contactsError) {
    throw new Error(`Failed to load contacts: ${contactsError.message}`)
  }

  return (
    contacts?.find((contact) =>
      Array.isArray(contact.phone_numbers) &&
      contact.phone_numbers.some((entry) => phoneEntryMatches(entry, normalizedPhone))
    ) || null
  )
}

export interface SendSMSParams {
  userId: string
  userEmail?: string | null
  fullName?: string | null
  ownerUserId?: string | null
  to: string
  body: string
  contactId?: string
  propertyId?: string
  mediaUrls?: string[]
  request?: Request
  assignment?: UserPhoneNumberRecord
}

export interface SMSResult {
  success: boolean
  messageSid?: string
  error?: string
  messageId?: string
  errorCode?: string
  status?: number
}

/**
 * Send an SMS message via SignalWire and store it in the database.
 */
export async function sendSMS(params: SendSMSParams): Promise<SMSResult> {
  const {
    userId,
    userEmail,
    fullName,
    ownerUserId,
    to,
    body,
    contactId,
    propertyId,
    mediaUrls,
    request,
    assignment: existingAssignment,
  } = params

  const assignment =
    existingAssignment ||
    (await ensureUserPhoneNumberForUser({
      userId,
      userEmail,
      fullName,
      request,
    }))

  const fromNumber = assignment.phone_number
  if (!fromNumber) {
    throw new Error('This user does not have an active dedicated phone number.')
  }

  const normalizedTo = normalizePhoneNumber(to)
  if (!normalizedTo) {
    throw new Error('Phone number must be in E.164 format (e.g., +1234567890)')
  }

  const suppression = await checkMarketingSuppression({
    channel: 'sms',
    destination: normalizedTo,
    ownerUserId: ownerUserId || userId,
  })

  if (!suppression.allowed) {
    return {
      success: false,
      error: 'Destination is globally suppressed for SMS.',
      errorCode: 'SUPPRESSED',
      status: 403,
    }
  }

  const statusCallback = buildStatusCallbackUrl(request)

  try {
    const message = await getSignalWireClient().messages.create({
      body,
      from: fromNumber,
      to: normalizedTo,
      ...(mediaUrls && mediaUrls.length > 0 ? { mediaUrl: mediaUrls } : {}),
      ...(statusCallback ? { statusCallback } : {}),
    })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('messages')
      .insert({
        body,
        direction: 'outbound',
        status: normalizeSmsProviderStatus(message.status),
        from_number: fromNumber,
        to_number: normalizedTo,
        twilio_sid: message.sid,
        twilio_status: message.status,
        user_id: userId,
        user_phone_number_id: assignment.id,
        contact_id: contactId || null,
        property_id: propertyId || null,
        media_urls: mediaUrls || null,
        num_segments: message.numSegments ? parseInt(message.numSegments, 10) : 1,
        price: message.price ? parseFloat(message.price) : null,
        price_unit: message.priceUnit || 'USD',
      })
      .select()
      .single()

    if (error) {
      console.error('Error storing message in database:', error)
      return {
        success: true,
        messageSid: message.sid,
        error: `Message sent but not stored: ${error.message}`,
      }
    }

    return {
      success: true,
      messageSid: message.sid,
      messageId: data.id,
    }
  } catch (error: unknown) {
    console.error('Error sending SMS via SignalWire:', error)

    try {
      const supabase = createAdminClient()
      const err = error as { code?: string | number; message?: string }

      await supabase
        .from('messages')
        .insert({
          body,
          direction: 'outbound',
          status: 'failed',
          from_number: fromNumber,
          to_number: normalizedTo,
          error_code: err.code?.toString() || null,
          error_message: err.message || 'Unknown error',
          user_id: userId,
          user_phone_number_id: assignment.id,
          contact_id: contactId || null,
          property_id: propertyId || null,
          media_urls: mediaUrls || null,
        })
    } catch (dbError) {
      console.error('Error storing failed message:', dbError)
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    }
  }
}

export async function getConversation(
  contactPhone: string,
  userId: string,
  limit: number = 50
) {
  const normalizedPhone = normalizePhoneNumber(contactPhone)
  if (!normalizedPhone) {
    throw new Error('Invalid phone number.')
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .or(`from_number.eq.${normalizedPhone},to_number.eq.${normalizedPhone}`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch conversation: ${error.message}`)
  }

  return data
}

export async function getRecentMessages(userId: string, limit: number = 50) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      contact:contacts(id, name),
      property:properties(id, address, city, state)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch recent messages: ${error.message}`)
  }

  return data
}

export async function storeIncomingMessage(params: {
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

  const assignment = await getUserPhoneNumberByNumber(normalizedTo)
  if (!assignment) {
    return { stored: false as const, reason: 'unowned-number' as const }
  }

  const contact = await findContactByPhoneNumber(assignment.user_id, normalizedFrom)
  const supabase = createAdminClient()
  const suppressionKeywordResult = await applyInboundSmsSuppressionKeyword({
    ownerUserId: assignment.user_id,
    destination: normalizedFrom,
    body: params.body,
    contactId: contact?.id || null,
    propertyId: contact?.property_id || null,
    supabase,
  })

  const { error } = await supabase
    .from('messages')
    .insert({
      body: params.body,
      direction: 'inbound',
      status: params.smsStatus
        ? normalizeSmsProviderStatus(params.smsStatus)
        : 'received',
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
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to store incoming message: ${error.message}`)
  }

  return {
    stored: true as const,
    assignment,
    suppressionKeywordResult,
  }
}

export async function updateMessageStatus(
  twilioSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
) {
  const supabase = createAdminClient()
  const normalizedStatus = normalizeSmsProviderStatus(status)

  const { error } = await supabase
    .from('messages')
    .update({
      status: normalizedStatus,
      twilio_status: status,
      error_code: errorCode || null,
      error_message: errorMessage || null,
    })
    .eq('twilio_sid', twilioSid)

  if (error) {
    throw new Error(`Failed to update message status: ${error.message}`)
  }
}
