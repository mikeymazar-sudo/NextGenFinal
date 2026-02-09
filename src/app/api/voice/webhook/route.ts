import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers.get('x-twilio-signature') || ''
      const url = req.url
      const isValid = twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN!,
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

    const supabase = createAdminClient()

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
            ended_at: callStatus === 'completed' ? new Date().toISOString() : undefined,
          })
          .eq('twilio_call_sid', callSid)
      } else if (callerId) {
        // Create new call record
        await supabase.from('calls').insert({
          twilio_call_sid: callSid,
          caller_id: callerId,
          from_number: from,
          to_number: to,
          status: callStatus,
          duration,
        })
      }
    }

    // Return empty TwiML response
    const twiml = new twilio.twiml.VoiceResponse()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('Voice webhook error:', error)
    const twiml = new twilio.twiml.VoiceResponse()
    twiml.say('An error occurred. Please try again later.')
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
