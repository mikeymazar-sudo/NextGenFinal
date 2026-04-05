import { NextRequest, NextResponse } from 'next/server'
import { RestClient } from '@signalwire/compatibility-api'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserPhoneNumberForUser } from '@/lib/signalwire/user-phone-numbers'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    // Validate SignalWire signature in production
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers.get('x-signalwire-signature') || ''
      const url = req.url
      const isValid = RestClient.validateRequest(
        process.env.SIGNALWIRE_SIGNING_KEY!,
        signature,
        url,
        params
      )
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
    }

    const callSid = params.CallSid
    const callStatus = params.CallStatus
    const from = params.From
    const to = params.To
    const duration = params.CallDuration ? parseInt(params.CallDuration) : null
    const callerId = params.Caller?.startsWith('client:') ? params.Caller.replace('client:', '') : null
    const recordingSid = params.RecordingSid
    const recordingUrl = params.RecordingUrl

    const supabase = createAdminClient()
    const assignment = callerId ? await getUserPhoneNumberForUser(callerId) : null

    if (callSid) {
      // Check if call record exists
      const { data: existingCall } = await supabase
        .from('calls')
        .select('id')
        .eq('twilio_call_sid', callSid)
        .single()

      if (existingCall) {
        // Update existing call
        await supabase
          .from('calls')
          .update({
            status: callStatus,
            duration,
            user_phone_number_id: assignment?.id || undefined,
            ended_at: callStatus === 'completed' ? new Date().toISOString() : undefined,
            recording_sid: recordingSid,
            recording_url: recordingUrl,
          })
          .eq('twilio_call_sid', callSid)
      } else if (callerId) {
        // Create new call record
        await supabase.from('calls').insert({
          twilio_call_sid: callSid,
          caller_id: callerId,
          user_phone_number_id: assignment?.id || null,
          from_number: from,
          to_number: to,
          status: callStatus,
          duration,
        })
      }
    }

    // Return empty cXML response
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
