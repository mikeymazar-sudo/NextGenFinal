import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { listUnifiedMarketingEvents } from '@/app/api/marketing/_lib'

export const GET = withAuth(async (_request: NextRequest, { user, params }) => {
  try {
    const { threadId } = (await params) as { threadId: string }
    const decodedThreadId = decodeURIComponent(threadId)
    const events = await listUnifiedMarketingEvents(user.id)
    const threadEvents = events.filter((event) => event.threadKey === decodedThreadId)

    if (threadEvents.length === 0) {
      return Errors.notFound('Thread')
    }

    return apiSuccess({
      threadId: decodedThreadId,
      events: threadEvents,
    })
  } catch (error) {
    console.error('Marketing inbox thread error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to load thread.')
  }
})
