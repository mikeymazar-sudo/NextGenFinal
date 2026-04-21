import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { getCampaignEnrollments, getCampaignSteps, getOwnedCampaign } from '@/app/api/marketing/_lib'

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  audienceSourceType: z.string().nullable().optional(),
  audienceSourceId: z.string().uuid().nullable().optional(),
  draftPayload: z.record(z.string(), z.unknown()).optional(),
  reviewState: z.string().optional(),
})

export const GET = withAuth(async (_request: NextRequest, { user, params }) => {
  try {
    const { id } = (await params) as { id: string }
    const campaign = await getOwnedCampaign(id, user.id)

    if (!campaign) {
      return Errors.notFound('Campaign')
    }

    const [steps, enrollments] = await Promise.all([
      getCampaignSteps(campaign.id),
      getCampaignEnrollments(campaign.id),
    ])

    return apiSuccess({ campaign, steps, enrollments })
  } catch (error) {
    console.error('Campaign detail error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to load campaign.')
  }
})

export const PATCH = withAuth(async (request: NextRequest, { user, params }) => {
  try {
    const { id } = (await params) as { id: string }
    const parsed = UpdateCampaignSchema.safeParse(await request.json())

    if (!parsed.success) {
      return Errors.badRequest('Invalid campaign update payload.')
    }

    const campaign = await getOwnedCampaign(id, user.id)
    if (!campaign) {
      return Errors.notFound('Campaign')
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.audienceSourceType !== undefined) updates.audience_source_type = parsed.data.audienceSourceType
    if (parsed.data.audienceSourceId !== undefined) updates.audience_source_id = parsed.data.audienceSourceId
    if (parsed.data.draftPayload !== undefined) updates.draft_payload = parsed.data.draftPayload
    if (parsed.data.reviewState !== undefined) updates.review_state = parsed.data.reviewState

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', campaign.id)
      .eq('owner_user_id', user.id)
      .select('*')
      .single()

    if (error || !data) {
      return Errors.internal(error?.message || 'Failed to update campaign.')
    }

    return apiSuccess({ campaign: data })
  } catch (error) {
    console.error('Campaign update error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to update campaign.')
  }
})
