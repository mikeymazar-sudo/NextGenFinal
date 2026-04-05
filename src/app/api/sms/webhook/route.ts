import { NextRequest, NextResponse } from 'next/server'
import { RestClient } from '@signalwire/compatibility-api'
import { storeIncomingMessage } from '@/lib/twilio/sms'

const signingKey = process.env.SIGNALWIRE_SIGNING_KEY

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-signalwire-signature') || ''
    const url = request.url

    const formData = await request.formData()
    const params: Record<string, FormDataEntryValue> = {}
    formData.forEach((value, key) => {
      params[key] = value
    })

    if (signingKey) {
      const isValid = RestClient.validateRequest(signingKey, signature, url, params)

      if (!isValid) {
        console.error('Invalid SignalWire signature')
        return new NextResponse('Forbidden', { status: 403 })
      }
    }

    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      NumSegments,
      SmsStatus,
    } = params

    const mediaUrls: string[] = []
    const numMedia = parseInt(NumMedia?.toString() || '0', 10)
    for (let i = 0; i < numMedia && i < 5; i++) {
      const mediaUrl = params[`MediaUrl${i}`]
      if (typeof mediaUrl === 'string' && mediaUrl) {
        mediaUrls.push(mediaUrl)
      }
    }

    await storeIncomingMessage({
      from: From?.toString() || '',
      to: To?.toString() || '',
      body: Body?.toString() || '',
      messageSid: MessageSid?.toString() || undefined,
      smsStatus: SmsStatus?.toString() || undefined,
      mediaUrls,
      numSegments: parseInt(NumSegments?.toString() || '1', 10),
    })

    const cxml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`

    return new NextResponse(cxml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  } catch (error) {
    console.error('Error in SMS webhook:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
