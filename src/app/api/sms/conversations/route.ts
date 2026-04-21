import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { getConversation, getRecentMessages } from '@/lib/twilio/sms'
import { normalizePhoneNumber } from '@/lib/utils'

export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const searchParams = request.nextUrl.searchParams
    const contactPhone = searchParams.get('phone')
    const rawLimit = Number.parseInt(searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50

    if (contactPhone) {
      if (!normalizePhoneNumber(contactPhone)) {
        return Errors.badRequest('Invalid phone number format.')
      }

      const messages = await getConversation(contactPhone, user.id, limit)
      return apiSuccess({ messages })
    }

    const messages = await getRecentMessages(user.id, limit)
    return apiSuccess({ messages })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return Errors.internal(
      error instanceof Error ? error.message : 'Internal server error'
    )
  }
})
