import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiError, apiSuccess, Errors } from '@/lib/api/response'
import { getSignalWireEnv } from '@/lib/signalwire/config'
import {
  findSignalWireOutboundAddressId,
  type SignalWireAddress,
} from '@/lib/signalwire/shared'

export const runtime = 'nodejs'

function getSafeVoiceErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
      .replace(/SignalWire/gi, 'voice service')
      .replace(/SIGNALWIRE_[A-Z0-9_]+/g, 'voice service setting')
  }

  if (typeof error === 'string' && error.trim()) {
    return error
      .replace(/SignalWire/gi, 'voice service')
      .replace(/SIGNALWIRE_[A-Z0-9_]+/g, 'voice service setting')
  }

  return fallback
}

export const GET = withAuth(async (_req: NextRequest, { user }) => {
  try {
    const {
      spaceHost,
      fabricHost,
      projectId,
      apiToken,
      phoneNumber,
      subscriberReference,
    } = getSignalWireEnv()

    if (!spaceHost || !projectId || !apiToken) {
      return apiError(
        'Voice calling is not configured for this environment.',
        'VOICE_NOT_CONFIGURED',
        503
      )
    }

    const credentials = Buffer.from(`${projectId}:${apiToken}`).toString('base64')
    const activeSubscriberReference =
      phoneNumber && subscriberReference ? subscriberReference : user.id

    const response = await fetch(
      `https://${spaceHost}/api/fabric/subscribers/tokens`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference: activeSubscriberReference,
        }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      console.error('SignalWire token error:', response.status, text)

      if (response.status === 401) {
        return apiError(
          'Voice provider authentication failed. Check your voice service configuration.',
          'VOICE_AUTH_FAILED',
          502,
          { status: response.status }
        )
      }

      return Errors.externalApi('Voice service', { status: response.status })
    }

    const data = await response.json()

    if (phoneNumber && fabricHost && subscriberReference) {
      const subscriberInfoResponse = await fetch(
        `https://${fabricHost}/api/fabric/subscriber/info`,
        {
          headers: {
            Authorization: `Bearer ${data.token}`,
          },
        }
      )

      if (!subscriberInfoResponse.ok) {
        const text = await subscriberInfoResponse.text()
        console.error(
          'Voice token subscriber info error:',
          subscriberInfoResponse.status,
          text
        )
        return Errors.externalApi('Voice service', {
          status: subscriberInfoResponse.status,
        })
      }

      const subscriberInfo =
        (await subscriberInfoResponse.json()) as {
          fabric_addresses?: SignalWireAddress[]
        }
      let sharedOutboundAddressId = findSignalWireOutboundAddressId(
        subscriberInfo.fabric_addresses || [],
        phoneNumber
      )

      if (!sharedOutboundAddressId) {
        const { resolveSignalWireOutboundAddressIdForToken } = await import(
          '@/lib/signalwire/user-phone-numbers'
        )
        sharedOutboundAddressId =
          await resolveSignalWireOutboundAddressIdForToken(
            data.token,
            phoneNumber,
            subscriberInfo.fabric_addresses || []
          )
      }

      if (!sharedOutboundAddressId) {
        return apiError(
          'No outbound voice address is configured for the shared browser voice setup.',
          'VOICE_OUTBOUND_NOT_CONFIGURED',
          503
        )
      }

      return apiSuccess({
        token: data.token,
        identity: user.id,
        outboundAddressId: sharedOutboundAddressId,
        phoneNumber,
        phoneNumberId: null,
      })
    }

    const { getUserPhoneNumberForUser } = await import(
      '@/lib/signalwire/user-phone-numbers'
    )
    const assignment = await getUserPhoneNumberForUser(user.id)

    if (!assignment?.phone_number) {
      return apiError(
        'No dedicated phone number is assigned to this account yet. Open Settings to connect an existing number or provision a new one.',
        'VOICE_NUMBER_NOT_READY',
        503
      )
    }

    const outboundAddressId = assignment.signalwire_address_id

    if (!outboundAddressId) {
      return apiError(
        assignment.voice_routing_error ||
          'Your dedicated number is provisioned, but browser voice routing is not attached yet.',
        'VOICE_OUTBOUND_NOT_CONFIGURED',
        503
      )
    }

    return apiSuccess({
      token: data.token,
      identity: user.id,
      outboundAddressId,
      phoneNumber: assignment.phone_number,
      phoneNumberId: assignment.id,
    })
  } catch (error) {
    console.error('Voice token error:', error)
    return apiError(
      getSafeVoiceErrorMessage(error, 'Voice token setup failed.'),
      'VOICE_TOKEN_ERROR',
      500
    )
  }
})
