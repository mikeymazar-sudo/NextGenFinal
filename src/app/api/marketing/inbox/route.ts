import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { buildMarketingThreads, listUnifiedMarketingEvents } from '@/app/api/marketing/_lib'

export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const searchParams = request.nextUrl.searchParams
    const filter = searchParams.get('filter')
    const campaignId = searchParams.get('campaignId')

    let events = await listUnifiedMarketingEvents(user.id)

    if (campaignId) {
      events = events.filter((event) => String(event.meta?.campaignId || '') === campaignId)
    }

    let threads = buildMarketingThreads(events)

    if (filter === 'needs_reply') {
      threads = threads.filter((thread) => thread.needsReply)
    }

    if (filter === 'failed') {
      threads = threads.filter((thread) => thread.status === 'failed')
    }

    if (filter === 'review_required') {
      threads = threads.filter((thread) => thread.status === 'review_required')
    }

    return apiSuccess({
      threads,
      filters: {
        needsReply: buildMarketingThreads(events).filter((thread) => thread.needsReply).length,
        failed: buildMarketingThreads(events).filter((thread) => thread.status === 'failed').length,
      },
    })
  } catch (error) {
    console.error('Marketing inbox error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to load marketing inbox.')
  }
})
