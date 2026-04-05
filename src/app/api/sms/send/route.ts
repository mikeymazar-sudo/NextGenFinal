import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiError, apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { ensureUserPhoneNumberForUser } from '@/lib/signalwire/user-phone-numbers'
import { sendSMS } from '@/lib/twilio/sms'

export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json()
    const { to, message, contactId, propertyId, mediaUrls } = body

    if (!to || !message) {
      return Errors.badRequest('Missing required fields: to, message')
    }

    if (!to.match(/^\+[1-9]\d{1,14}$/)) {
      return Errors.badRequest(
        'Invalid phone number format. Must be in E.164 format (e.g., +12345678900)'
      )
    }

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
      request,
    })

    const result = await sendSMS({
      userId: user.id,
      userEmail: user.email,
      fullName: profile?.full_name || null,
      to,
      body: message,
      contactId,
      propertyId,
      mediaUrls,
      request,
      assignment,
    })

    if (!result.success) {
      return apiError(result.error || 'Failed to send SMS', 'SMS_SEND_FAILED', 500)
    }

    return apiSuccess({
      success: true,
      messageSid: result.messageSid,
      messageId: result.messageId,
      phoneNumber: assignment.phone_number,
    })
  } catch (error) {
    console.error('Error in SMS send API:', error)
    return apiError(
      error instanceof Error ? error.message : 'Internal server error',
      'SMS_SEND_FAILED',
      500
    )
  }
})
