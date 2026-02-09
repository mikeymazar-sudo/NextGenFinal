import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const to = formData.get('To')?.toString()

    const twiml = new twilio.twiml.VoiceResponse()

    if (to) {
      const dial = twiml.dial({
        callerId: process.env.TWILIO_PHONE_NUMBER!,
        answerOnBridge: true,
      })
      dial.number(to)
    } else {
      twiml.say('No number provided.')
    }

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('Outbound TwiML error:', error)
    const twiml = new twilio.twiml.VoiceResponse()
    twiml.say('An error occurred placing your call.')
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
