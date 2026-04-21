import { NextRequest, NextResponse } from 'next/server'
import { RestClient } from '@/lib/signalwire/compatibility-api'

export const runtime = 'nodejs'

function getFormValue(params: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key]
    if (value && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function isTruthyValue(value: string | null) {
  if (!value) return false

  const normalized = value.trim().toLowerCase()
  return !['false', '0', 'no', 'off', 'none', 'null'].includes(normalized)
}

function getVoicemailUrl(params: Record<string, string>) {
  return getFormValue(
    params,
    'VoicemailUrl',
    'voicemailUrl',
    'voicemail_url',
    'VoicemailAssetUrl',
    'voicemailAssetUrl',
    'voicemail_asset_url',
    'MessageUrl',
    'messageUrl',
    'message_url',
    'PlayUrl',
    'playUrl',
    'play_url'
  )
}

function isVoicemailMode(params: Record<string, string>) {
  const mode = getFormValue(
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

  if (mode && /voicemail|drop_voicemail|leave_voicemail/i.test(mode)) {
    return true
  }

  return isTruthyValue(getFormValue(params, 'Voicemail', 'voicemail', 'IsVoicemail', 'isVoicemail'))
}

export async function POST(req: NextRequest) {
  try {
    const params: Record<string, string> = {}

    req.nextUrl.searchParams.forEach((value, key) => {
      params[key] = value
    })

    const formData = await req.formData()
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    const voicemailUrl = getVoicemailUrl(params)
    const isMarketingVoicemail = Boolean(voicemailUrl) || isVoicemailMode(params)
    const destination = getFormValue(params, 'To', 'to')
    const callerId =
      getFormValue(params, 'CallerId', 'callerId', 'caller_id') ||
      process.env.SIGNALWIRE_PHONE_NUMBER ||
      undefined

    const twiml = new RestClient.LaML.VoiceResponse()

    if (isMarketingVoicemail) {
      if (voicemailUrl) {
        twiml.play(voicemailUrl)
        twiml.hangup()
      } else {
        twiml.say('No voicemail asset was provided.')
      }
    } else if (destination) {
      const dial = twiml.dial(
        callerId
          ? {
              callerId,
              answerOnBridge: true,
              record: 'record-from-answer',
            }
          : {
              answerOnBridge: true,
              record: 'record-from-answer',
            }
      )
      dial.number(destination)
    } else {
      twiml.say('No number or voicemail asset was provided.')
    }

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('Outbound voice response error:', error)
    const twiml = new RestClient.LaML.VoiceResponse()
    twiml.say('An error occurred placing your call.')
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
