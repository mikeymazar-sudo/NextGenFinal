import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { getConversation, getRecentMessages } from '@/lib/twilio/sms'

export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const searchParams = request.nextUrl.searchParams
    const contactPhone = searchParams.get('phone')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    if (contactPhone) {
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
