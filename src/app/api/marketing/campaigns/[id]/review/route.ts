import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { buildCampaignReview, getOwnedCampaign } from '@/app/api/marketing/_lib'

export const POST = withAuth(async (_request: NextRequest, { user, params }) => {
  try {
    const { id } = (await params) as { id: string }
    const campaign = await getOwnedCampaign(id, user.id)

    if (!campaign) {
      return Errors.notFound('Campaign')
    }

    const review = await buildCampaignReview(campaign)
    const supabase = createAdminClient()

    await supabase.from('campaign_enrollments').delete().eq('campaign_id', campaign.id)

    if (review.reviewRows.length > 0) {
      const { error: enrollmentsError } = await supabase
        .from('campaign_enrollments')
        .insert(
          review.reviewRows.map((row) => {
            const insertRow = Object.fromEntries(
              Object.entries(row).filter(([key]) => key !== 'meta')
            )

            return {
              campaign_id: campaign.id,
              ...insertRow,
            }
          })
        )

      if (enrollmentsError) {
        return Errors.internal(enrollmentsError.message)
      }
    }

    const nextReviewState = review.counts.eligible > 0 ? 'review_required' : 'draft'
    const { error: campaignError } = await supabase
      .from('campaigns')
      .update({
        review_state: nextReviewState,
        status: review.counts.eligible > 0 ? 'review_required' : 'draft',
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .eq('owner_user_id', user.id)

    if (campaignError) {
      return Errors.internal(campaignError.message)
    }

    return apiSuccess({
      reviewState: nextReviewState,
      ...review,
    })
  } catch (error) {
    console.error('Campaign review error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to review campaign.')
  }
})
