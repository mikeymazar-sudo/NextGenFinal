import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiError, apiSuccess, Errors } from '@/lib/api/response'
import { getSignalWireEnv } from '@/lib/signalwire/config'
import {
  findSignalWireOutboundAddressId,
  type SignalWireAddress,
} from '@/lib/signalwire/shared'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type SignalWireAddressListResponse = {
  data?: SignalWireAddress[]
}

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const {
      spaceHost,
      fabricHost,
      projectId,
      apiToken,
      phoneNumber,
    } = getSignalWireEnv()

    if (!spaceHost || !projectId || !apiToken) {
      return apiError(
        'Voice calling is not configured for this environment.',
        'VOICE_NOT_CONFIGURED',
        503
      )
    }

    const credentials = Buffer.from(`${projectId}:${apiToken}`).toString('base64')
    const activeSubscriberReference = user.id

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
          'SignalWire authentication failed. Check SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, and SIGNALWIRE_SPACE_URL.',
          'VOICE_AUTH_FAILED',
          502,
          { status: response.status }
        )
      }

      return Errors.externalApi('SignalWire', { status: response.status })
    }

    const data = await response.json()

    if (phoneNumber && fabricHost) {
      const addressResponse = await fetch(
        `https://${fabricHost}/api/fabric/addresses?page_size=100`,
        {
          headers: {
            Authorization: `Bearer ${data.token}`,
          },
        }
      )

      if (!addressResponse.ok) {
        const text = await addressResponse.text()
        console.error(
          'SignalWire address lookup error:',
          addressResponse.status,
          text
        )
        return Errors.externalApi('SignalWire', { status: addressResponse.status })
      }

      const addressData =
        (await addressResponse.json()) as SignalWireAddressListResponse
      const sharedOutboundAddressId = findSignalWireOutboundAddressId(
        addressData.data || [],
        phoneNumber
      )

      if (!sharedOutboundAddressId) {
        return apiError(
          'SignalWire outbound audio address not found for SIGNALWIRE_PHONE_NUMBER.',
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

    const { ensureUserPhoneNumberForUser } = await import(
      '@/lib/signalwire/user-phone-numbers'
    )
    const supabase = createAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    const assignment = await ensureUserPhoneNumberForUser({
      userId: user.id,
      userEmail: user.email,
      fullName: profile?.full_name || null,
      request: req,
    })

    if (!assignment.phone_number) {
      return apiError(
        'Your dedicated phone number has not finished provisioning yet.',
        'VOICE_NUMBER_NOT_READY',
        503
      )
    }

    const outboundAddressId = assignment.signalwire_address_id

    if (!outboundAddressId) {
      return apiError(
        assignment.voice_routing_error ||
          'Your dedicated number is provisioned, but browser voice routing is not attached in SignalWire yet.',
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
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Voice token setup failed.',
      'VOICE_TOKEN_ERROR',
      500
    )
  }
})
