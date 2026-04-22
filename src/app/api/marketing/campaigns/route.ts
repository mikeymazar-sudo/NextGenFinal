import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { getCampaignSteps, getMarketingActorProfile, listOwnedCampaigns } from '@/app/api/marketing/_lib'

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  channel: z.enum(['sms', 'email', 'voice', 'multi']),
  audienceSourceType: z.string().optional(),
  audienceSourceId: z.string().uuid().optional(),
  draftPayload: z.record(z.string(), z.unknown()).optional(),
  steps: z.array(z.record(z.string(), z.unknown())).optional(),
})

function getDefaultActionType(channel: 'sms' | 'email' | 'voice' | 'multi') {
  if (channel === 'email') return 'send_email'
  if (channel === 'voice') return 'drop_voicemail'
  if (channel === 'multi') return 'workflow'
  return 'send_sms'
}

export const GET = withAuth(async (_request: NextRequest, { user }) => {
  try {
    const campaigns = await listOwnedCampaigns(user.id)
    return apiSuccess({ campaigns })
  } catch (error) {
    console.error('Campaign list error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to list campaigns.')
  }
})

export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json()
    const parsed = CreateCampaignSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid campaign payload.')
    }

    const supabase = createAdminClient()
    const actor = await getMarketingActorProfile(user.id, user.email)
    const { name, channel, audienceSourceType, audienceSourceId, draftPayload, steps } = parsed.data

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        owner_user_id: user.id,
        team_id: actor.team_id,
        name,
        channel,
        status: 'draft',
        review_state: 'draft',
        launch_state: 'not_started',
        audience_source_type: audienceSourceType || null,
        audience_source_id: audienceSourceId || null,
        draft_payload: draftPayload || {},
      })
      .select('*')
      .single()

    if (campaignError || !campaign) {
      return Errors.internal(campaignError?.message || 'Failed to create campaign.')
    }

    const initialSteps = channel === 'multi'
      ? []
      : steps && steps.length > 0
        ? steps.map((step, index) => ({
            campaign_id: campaign.id,
            step_order: index + 1,
            channel,
            action_type: typeof step.actionType === 'string' ? step.actionType : getDefaultActionType(channel),
            content_payload: step,
            template_label: typeof step.templateLabel === 'string' ? step.templateLabel : null,
            voicemail_asset_id: typeof step.voicemailAssetId === 'string' ? step.voicemailAssetId : null,
            review_state: 'draft',
            execution_status: 'queued',
          }))
        : [{
            campaign_id: campaign.id,
            step_order: 1,
            channel,
            action_type: getDefaultActionType(channel),
            content_payload: draftPayload || {},
            template_label: null,
            voicemail_asset_id: null,
            review_state: 'draft',
            execution_status: 'queued',
          }]

    if (initialSteps.length > 0) {
      const { error: stepError } = await supabase.from('campaign_steps').insert(initialSteps)
      if (stepError) {
        return Errors.internal(stepError.message)
      }
    }

    return apiSuccess({
      campaign,
      steps: await getCampaignSteps(campaign.id),
    })
  } catch (error) {
    console.error('Campaign create error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to create campaign.')
  }
})
