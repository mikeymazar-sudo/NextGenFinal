import { NextRequest, NextResponse } from 'next/server'
import { RestClient } from '@/lib/signalwire/compatibility-api'
import { createAdminClient } from '@/lib/supabase/server'
import {
  buildCommunicationThreadKey,
  normalizeCommunicationStatus,
} from '@/lib/marketing/communications'
import {
  getUserPhoneNumberByNumber,
  getUserPhoneNumberForUser,
} from '@/lib/signalwire/user-phone-numbers'
import { normalizePhoneNumber } from '@/lib/utils'

export const runtime = 'nodejs'

type VoiceWebhookParams = Record<string, string>
type NormalizedVoiceStatus = 'queued' | 'answered' | 'voicemail_left' | 'no_answer' | 'failed'

function getFormValue(params: VoiceWebhookParams, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key]
    if (value && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function getCallerId(params: VoiceWebhookParams) {
  const caller = getFormValue(params, 'Caller', 'caller', 'CallerId', 'callerId')
  if (!caller) return null

  return caller.startsWith('client:') ? caller.slice('client:'.length) : caller
}

function getPhoneNumber(value: string | null) {
  return normalizePhoneNumber(value || '') || null
}

function getExistingString(
  record: Record<string, unknown> | null,
  key: string
) {
  if (!record) return null

  const value = record[key]
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed || null
}

function getExistingNumber(
  record: Record<string, unknown> | null,
  key: string
) {
  if (!record) return null

  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isTruthyValue(value: string | null) {
  if (!value) return false

  const normalized = value.trim().toLowerCase()
  return !['false', '0', 'no', 'off', 'none', 'null'].includes(normalized)
}

function getVoiceMode(params: VoiceWebhookParams) {
  return getFormValue(
    params,
    'Mode',
    'mode',
    'CampaignMode',
    'campaignMode',
    'campaign_mode',
    'ActionType',
    'actionType',
    'action_type'
  )
}

function isVoicemailCampaign(params: VoiceWebhookParams) {
  const mode = getVoiceMode(params)
  if (mode && /voicemail|drop_voicemail|leave_voicemail/i.test(mode)) {
    return true
  }

  return (
    isTruthyValue(getFormValue(params, 'Voicemail', 'voicemail', 'IsVoicemail', 'isVoicemail')) ||
    Boolean(
      getFormValue(
        params,
        'VoicemailUrl',
        'voicemailUrl',
        'voicemail_url',
        'VoicemailAssetUrl',
        'voicemailAssetUrl',
        'voicemail_asset_url',
        'VoicemailAssetId',
        'voicemailAssetId',
        'voicemail_asset_id'
      )
    )
  )
}

function normalizeVoiceStatus(
  callStatus: string | null,
  params: VoiceWebhookParams
): NormalizedVoiceStatus {
  return normalizeCommunicationStatus({
    channel: 'voice',
    status: callStatus,
    answeredBy: getFormValue(params, 'AnsweredBy', 'answeredBy', 'answered_by'),
    isVoicemailCampaign: isVoicemailCampaign(params),
  }) as NormalizedVoiceStatus
}

function getEventTimestamp(params: VoiceWebhookParams) {
  return (
    getFormValue(params, 'Timestamp', 'timestamp', 'EventTimestamp', 'eventTimestamp') ||
    new Date().toISOString()
  )
}

async function resolveVoiceOwnership(params: VoiceWebhookParams) {
  const callerId = getCallerId(params)
  const fromNumber = getPhoneNumber(getFormValue(params, 'From', 'from'))
  const toNumber = getPhoneNumber(getFormValue(params, 'To', 'to'))

  if (callerId) {
    const byCaller = await getUserPhoneNumberForUser(callerId)
    if (byCaller) {
      return {
        ownerUserId: byCaller.user_id,
        assignment: byCaller,
        callerId,
        fromNumber,
        toNumber,
      }
    }
  }

  if (fromNumber) {
    const byFrom = await getUserPhoneNumberByNumber(fromNumber)
    if (byFrom) {
      return {
        ownerUserId: byFrom.user_id,
        assignment: byFrom,
        callerId: callerId || byFrom.user_id,
        fromNumber,
        toNumber,
      }
    }
  }

  if (toNumber) {
    const byTo = await getUserPhoneNumberByNumber(toNumber)
    if (byTo) {
      return {
        ownerUserId: byTo.user_id,
        assignment: byTo,
        callerId: callerId || byTo.user_id,
        fromNumber,
        toNumber,
      }
    }
  }

  return {
    ownerUserId: callerId || null,
    assignment: null,
    callerId,
    fromNumber,
    toNumber,
  }
}

async function loadExistingCall(
  supabase: ReturnType<typeof createAdminClient>,
  callSid: string | null,
  recordingSid: string | null
) {
  if (callSid) {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('twilio_call_sid', callSid)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to look up call by call SID: ${error.message}`)
    }

    if (data) {
      return data as Record<string, unknown>
    }
  }

  if (recordingSid) {
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('recording_sid', recordingSid)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to look up call by recording SID: ${error.message}`)
    }

    if (data) {
      return data as Record<string, unknown>
    }
  }

  return null
}

async function upsertCommunicationThread(
  supabase: ReturnType<typeof createAdminClient>,
  context: {
    ownerUserId: string
    propertyId: string | null
    contactId: string | null
    campaignId: string | null
    destination: string
    direction: 'inbound' | 'outbound'
    status: NormalizedVoiceStatus
    eventAt: string
  }
) {
  const threadKey = buildCommunicationThreadKey(
    context.ownerUserId,
    context.propertyId,
    context.contactId,
    context.destination
  )

  const { data: existingThread, error: existingThreadError } = await supabase
    .from('communication_threads')
    .select('id, last_event_at')
    .eq('owner_user_id', context.ownerUserId)
    .eq('thread_key', threadKey)
    .maybeSingle()

  if (existingThreadError) {
    throw new Error(`Failed to load voice thread summary: ${existingThreadError.message}`)
  }

  if (
    existingThread &&
    new Date(existingThread.last_event_at).getTime() > new Date(context.eventAt).getTime()
  ) {
    return
  }

  const threadPayload = {
    owner_user_id: context.ownerUserId,
    property_id: context.propertyId,
    contact_id: context.contactId,
    campaign_id: context.campaignId,
    thread_key: threadKey,
    primary_channel: 'voice',
    last_direction: context.direction,
    last_status: context.status,
    last_event_at: context.eventAt,
  }

  if (!existingThread) {
    const { error } = await supabase.from('communication_threads').insert({
      ...threadPayload,
      unread_count: 0,
      needs_reply: false,
    })

    if (error) {
      throw new Error(`Failed to create voice thread summary: ${error.message}`)
    }

    return
  }

  const { error } = await supabase
    .from('communication_threads')
    .update({
      property_id: context.propertyId,
      contact_id: context.contactId,
      campaign_id: context.campaignId,
      primary_channel: 'voice',
      last_direction: context.direction,
      last_status: context.status,
      last_event_at: context.eventAt,
    })
    .eq('id', existingThread.id)

  if (error) {
    throw new Error(`Failed to update voice thread summary: ${error.message}`)
  }
}

async function updateCampaignEnrollmentSummary(
  supabase: ReturnType<typeof createAdminClient>,
  context: {
    campaignId: string | null
    propertyId: string | null
    contactId: string | null
    callId: string | null
    status: NormalizedVoiceStatus
  }
) {
  if (!context.campaignId || !context.propertyId || !context.contactId) {
    return
  }

  const { error } = await supabase
    .from('campaign_enrollments')
    .update({
      delivery_status: context.status,
      latest_channel: 'voice',
      last_communication_id: context.callId,
    })
    .eq('campaign_id', context.campaignId)
    .eq('property_id', context.propertyId)
    .eq('contact_id', context.contactId)

  if (error) {
    throw new Error(`Failed to update campaign enrollment summary: ${error.message}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const params: VoiceWebhookParams = {}

    req.nextUrl.searchParams.forEach((value, key) => {
      params[key] = value
    })

    const formData = await req.formData()
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    if (process.env.NODE_ENV === 'production') {
      const signingKey = process.env.SIGNALWIRE_SIGNING_KEY
      if (!signingKey) {
        return NextResponse.json(
          { error: 'Voice webhook signature verification is not configured.' },
          { status: 403 }
        )
      }

      const signature = req.headers.get('x-signalwire-signature') || ''
      const isValid = RestClient.validateRequest(signingKey, signature, req.url, params)
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
    }

    const callSid = getFormValue(params, 'CallSid', 'callSid', 'call_sid')
    const callStatus = getFormValue(params, 'CallStatus', 'callStatus', 'call_status')
    const recordingSid = getFormValue(params, 'RecordingSid', 'recordingSid', 'recording_sid')
    const recordingUrl = getFormValue(params, 'RecordingUrl', 'recordingUrl', 'recording_url')
    const transcript =
      getFormValue(
        params,
        'TranscriptionText',
        'transcriptionText',
        'transcription_text',
        'Transcript',
        'transcript',
        'SpeechResult',
        'speechResult'
      ) || null
    const transcriptionStatus = getFormValue(
      params,
      'TranscriptionStatus',
      'transcriptionStatus',
      'transcription_status'
    )
    const durationValue = getFormValue(params, 'CallDuration', 'callDuration', 'call_duration')
    const duration = durationValue ? Number.parseInt(durationValue, 10) : null
    const eventAt = getEventTimestamp(params)
    const normalizedStatus = normalizeVoiceStatus(callStatus, params)

    const ownership = await resolveVoiceOwnership(params)
    const ownerUserId = ownership.ownerUserId
    const destination = ownership.toNumber || ownership.fromNumber || null
    const callRecordPropertyId =
      getFormValue(params, 'PropertyId', 'propertyId', 'property_id') ||
      getExistingString(ownership.assignment as Record<string, unknown> | null, 'property_id') ||
      null
    const callRecordContactId =
      getFormValue(params, 'ContactId', 'contactId', 'contact_id') ||
      getExistingString(ownership.assignment as Record<string, unknown> | null, 'contact_id') ||
      null
    const campaignId = getFormValue(params, 'CampaignId', 'campaignId', 'campaign_id') || null
    const isTerminal =
      normalizedStatus === 'voicemail_left' ||
      normalizedStatus === 'failed' ||
      normalizedStatus === 'no_answer' ||
      (callStatus || '').trim().toLowerCase().includes('completed')

    const supabase = createAdminClient()
    const existingCall = await loadExistingCall(supabase, callSid, recordingSid)
    const existingCallId = getExistingString(existingCall, 'id')
    const existingCallCallerId = getExistingString(existingCall, 'caller_id')
    const existingCallUserPhoneNumberId = getExistingString(existingCall, 'user_phone_number_id')
    const existingCallPropertyId = getExistingString(existingCall, 'property_id')
    const existingCallContactId = getExistingString(existingCall, 'contact_id')
    const existingCallTwilioCallSid = getExistingString(existingCall, 'twilio_call_sid')
    const existingCallFromNumber = getExistingString(existingCall, 'from_number')
    const existingCallToNumber = getExistingString(existingCall, 'to_number')
    const existingCallRecordingSid = getExistingString(existingCall, 'recording_sid')
    const existingCallRecordingUrl = getExistingString(existingCall, 'recording_url')
    const existingCallTranscript = getExistingString(existingCall, 'transcript')
    const existingCallTranscriptionStatus = getExistingString(existingCall, 'transcription_status')
    const existingCallEndedAt = getExistingString(existingCall, 'ended_at')
    const existingCallDuration = getExistingNumber(existingCall, 'duration')

    if ((callSid || existingCall) && (ownerUserId || existingCallCallerId)) {
      const callPayload = {
        caller_id: ownerUserId || existingCallCallerId || '',
        user_phone_number_id: ownership.assignment?.id || existingCallUserPhoneNumberId || null,
        property_id: callRecordPropertyId || existingCallPropertyId || null,
        contact_id: callRecordContactId || existingCallContactId || null,
        twilio_call_sid: callSid || existingCallTwilioCallSid || null,
        from_number: getFormValue(params, 'From', 'from') || existingCallFromNumber || null,
        to_number: getFormValue(params, 'To', 'to') || existingCallToNumber || null,
        status: normalizedStatus,
        duration: duration ?? existingCallDuration ?? null,
        recording_sid: recordingSid || existingCallRecordingSid || null,
        recording_url: recordingUrl || existingCallRecordingUrl || null,
        transcript: transcript ?? existingCallTranscript ?? null,
        transcription_status:
          (transcriptionStatus?.trim().toLowerCase() === 'failed'
            ? 'failed'
            : transcriptionStatus?.trim().toLowerCase() === 'completed'
              ? 'completed'
              : transcriptionStatus?.trim().toLowerCase() === 'processing'
                ? 'processing'
                : transcript
                  ? 'completed'
                  : existingCallTranscriptionStatus || 'none'),
        ended_at:
          isTerminal && !existingCallEndedAt
            ? eventAt
            : existingCallEndedAt || null,
      }

      if (existingCallId) {
        const { error } = await supabase.from('calls').update(callPayload).eq('id', existingCallId)
        if (error) {
          throw new Error(`Failed to update voice call record: ${error.message}`)
        }
      } else if (callSid) {
        const { error } = await supabase.from('calls').insert(callPayload)
        if (error) {
          throw new Error(`Failed to create voice call record: ${error.message}`)
        }
      }
    }

    if (ownerUserId && destination) {
      await upsertCommunicationThread(supabase, {
        ownerUserId,
        propertyId: callRecordPropertyId,
        contactId: callRecordContactId,
        campaignId,
        destination,
        direction:
          getPhoneNumber(ownership.fromNumber) &&
          ownership.assignment?.phone_number &&
          getPhoneNumber(ownership.assignment.phone_number) === getPhoneNumber(ownership.fromNumber)
            ? 'outbound'
            : ownership.toNumber &&
                ownership.assignment?.phone_number &&
                getPhoneNumber(ownership.assignment.phone_number) === getPhoneNumber(ownership.toNumber)
              ? 'inbound'
              : 'outbound',
        status: normalizedStatus,
        eventAt,
      })
    }

    await updateCampaignEnrollmentSummary(supabase, {
      campaignId,
      propertyId: callRecordPropertyId,
      contactId: callRecordContactId,
      callId: callSid || existingCallTwilioCallSid || null,
      status: normalizedStatus,
    })

    const twiml = new RestClient.LaML.VoiceResponse()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('Voice webhook error:', error)
    const twiml = new RestClient.LaML.VoiceResponse()
    twiml.say('An error occurred. Please try again later.')
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
