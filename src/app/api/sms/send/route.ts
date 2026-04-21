import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiError, apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { requireContactOwnership, requirePropertyOwnership } from '@/lib/marketing/ownership'
import { ensureUserPhoneNumberForUser } from '@/lib/signalwire/user-phone-numbers'
import { sendSMS } from '@/lib/twilio/sms'
import { normalizePhoneNumber } from '@/lib/utils'

const SendSmsSchema = z.object({
  to: z.string().min(1),
  message: z.string().min(1),
  contactId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  mediaUrls: z.array(z.string()).optional(),
})

export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return Errors.badRequest('Invalid JSON body.')
    }

    const parsed = SendSmsSchema.safeParse(body)
    if (!parsed.success) {
      return Errors.badRequest('Missing required fields: to, message')
    }

    const { to, message, contactId, propertyId, mediaUrls } = parsed.data
    const normalizedTo = normalizePhoneNumber(to)
    if (!normalizedTo) {
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

    let effectivePropertyId: string | null = propertyId || null

    if (contactId) {
      const contactAccess = await requireContactOwnership(user.id, contactId, { supabase })
      if (!contactAccess.ok) {
        return contactAccess.response
      }

      effectivePropertyId = contactAccess.record.property_id

      if (propertyId && propertyId !== contactAccess.record.property_id) {
        return apiError(
          'Contact does not belong to the specified property.',
          'FORBIDDEN',
          403
        )
      }
    }

    if (propertyId) {
      const propertyAccess = await requirePropertyOwnership(user.id, propertyId, { supabase })
      if (!propertyAccess.ok) {
        return propertyAccess.response
      }

      effectivePropertyId = propertyAccess.record.id
    }

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
      ownerUserId: user.id,
      to: normalizedTo,
      body: message,
      contactId,
      propertyId: effectivePropertyId || undefined,
      mediaUrls,
      request,
      assignment,
    })

    if (!result.success) {
      return apiError(
        result.error || 'Failed to send SMS',
        result.errorCode || 'SMS_SEND_FAILED',
        result.status || 500
      )
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
