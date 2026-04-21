import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { buildMarketingAnalytics } from '@/app/api/marketing/_lib'

export const GET = withAuth(async (_request: NextRequest, { user }) => {
  try {
    const analytics = await buildMarketingAnalytics(user.id)
    return apiSuccess({ analytics })
  } catch (error) {
    console.error('Marketing analytics error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to load analytics.')
  }
})
