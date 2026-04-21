import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiError, apiSuccess } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveMarketingActor } from '@/lib/marketing/actor'
import {
  canConnectExistingConfiguredPhoneNumber,
  connectExistingConfiguredPhoneNumberToUser,
  ensureUserPhoneNumberForUser,
  getUserPhoneNumberForUser,
  toPublicUserPhoneNumber,
} from '@/lib/signalwire/user-phone-numbers'

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
    const assignment = toPublicUserPhoneNumber(
      await getUserPhoneNumberForUser(user.id)
    )
    const canConnectExistingNumber =
      !assignment?.phone_number &&
      (await canConnectExistingConfiguredPhoneNumber(user.id))

    return apiSuccess({ assignment, canConnectExistingNumber })
  } catch (error) {
    console.error('Phone number lookup error:', error)
    return apiError(
      getSafeVoiceErrorMessage(error, 'Failed to load phone number'),
      'PHONE_NUMBER_LOOKUP_FAILED',
      500
    )
  }
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const payload = (await req.json().catch(() => null)) as
      | { action?: string }
      | null

    const supabase = createAdminClient()
    const actor = await resolveMarketingActor(user.id, {
      supabase,
      email: user.email,
    })

    const assignment =
      payload?.action === 'connect-existing'
        ? await connectExistingConfiguredPhoneNumberToUser({
            userId: user.id,
            userEmail: user.email,
            fullName: actor.fullName,
            request: req,
          })
        : await ensureUserPhoneNumberForUser({
            userId: user.id,
            userEmail: user.email,
            fullName: actor.fullName,
            request: req,
          })

    return apiSuccess({
      assignment: toPublicUserPhoneNumber(assignment),
      canConnectExistingNumber: false,
    })
  } catch (error) {
    console.error('Phone number provisioning error:', error)
    return apiError(
      getSafeVoiceErrorMessage(error, 'Failed to provision dedicated phone number'),
      'PHONE_NUMBER_PROVISIONING_FAILED',
      500
    )
  }
})
