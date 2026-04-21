import { NextRequest, NextResponse } from 'next/server'
import { RestClient } from '@/lib/signalwire/compatibility-api'
import { updateMessageStatus } from '@/lib/twilio/sms'

export const runtime = 'nodejs'

const signingKey = process.env.SIGNALWIRE_SIGNING_KEY
const requiresWebhookSignature =
  process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-signalwire-signature') || ''
    const url = request.url

    const formData = await request.formData()
    const params: Record<string, FormDataEntryValue> = {}
    formData.forEach((value, key) => {
      params[key] = value
    })

    if (!signingKey && requiresWebhookSignature) {
      console.error('SignalWire signing key is not configured')
      return NextResponse.json(
        { error: 'Webhook signing key is not configured' },
        { status: 500 }
      )
    }

    if (signingKey) {
      const isValid = RestClient.validateRequest(
        signingKey,
        signature,
        url,
        params
      )

      if (!isValid) {
        console.error('Invalid SignalWire signature')
        return new NextResponse('Forbidden', { status: 403 })
      }
    }

    const {
      MessageSid,
      MessageStatus,
      ErrorCode,
      ErrorMessage,
    } = params

    if (!MessageSid || !MessageStatus) {
      return NextResponse.json(
        { error: 'Missing MessageSid or MessageStatus' },
        { status: 400 }
      )
    }

    await updateMessageStatus(
      MessageSid?.toString() || '',
      MessageStatus?.toString() || '',
      ErrorCode?.toString(),
      ErrorMessage?.toString()
    )

    return new NextResponse('OK', { status: 200 })
  } catch (error: unknown) {
    console.error('Error in SMS status webhook:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
