import { NextRequest } from 'next/server'
import twilio from 'twilio'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api-response'

export const GET = withAuth(async (_req: NextRequest, { user }) => {
  try {
    const AccessToken = twilio.jwt.AccessToken
    const VoiceGrant = AccessToken.VoiceGrant

    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_API_KEY_SID!,
      process.env.TWILIO_API_KEY_SECRET!,
      { identity: user.id, ttl: 3600 }
    )

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID!,
      incomingAllow: true,
    })

    token.addGrant(voiceGrant)

    return apiSuccess({ token: token.toJwt(), identity: user.id })
  } catch (error) {
    console.error('Voice token error:', error)
    return Errors.internal()
  }
})
