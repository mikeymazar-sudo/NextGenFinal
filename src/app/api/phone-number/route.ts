import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiError, apiSuccess } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import {
  ensureUserPhoneNumberForUser,
  getUserPhoneNumberForUser,
} from '@/lib/signalwire/user-phone-numbers'

async function getUserFullName(userId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load profile for phone provisioning: ${error.message}`)
  }

  return data?.full_name || null
}

export const GET = withAuth(async (_req: NextRequest, { user }) => {
  try {
    const assignment = await getUserPhoneNumberForUser(user.id)
    return apiSuccess({ assignment })
  } catch (error) {
    console.error('Phone number lookup error:', error)
    return apiError(
      error instanceof Error ? error.message : 'Failed to load phone number',
      'PHONE_NUMBER_LOOKUP_FAILED',
      500
    )
  }
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const fullName = await getUserFullName(user.id)
    const assignment = await ensureUserPhoneNumberForUser({
      userId: user.id,
      userEmail: user.email,
      fullName,
      request: req,
    })

    return apiSuccess({ assignment })
  } catch (error) {
    console.error('Phone number provisioning error:', error)
    return apiError(
      error instanceof Error
        ? error.message
        : 'Failed to provision dedicated phone number',
      'PHONE_NUMBER_PROVISIONING_FAILED',
      500
    )
  }
})
