import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import {
  buildMarketingAnalytics,
  buildMarketingThreads,
  getCampaignEnrollments,
  getCampaignSteps,
  getMarketingActorProfile,
  listOwnedCampaigns,
  listUnifiedMarketingEvents,
} from '@/app/api/marketing/_lib'
import { createAdminClient } from '@/lib/supabase/server'

export const GET = withAuth(async (_request: NextRequest, { user }) => {
  try {
    const supabase = createAdminClient()
    const actor = await getMarketingActorProfile(user.id, user.email)
    const [campaigns, events, analytics, listsResult, suppressionsResult] = await Promise.all([
      listOwnedCampaigns(user.id),
      listUnifiedMarketingEvents(user.id),
      buildMarketingAnalytics(user.id),
      supabase
        .from('lead_lists')
        .select('id, name, description, created_at')
        .eq('created_by', user.id),
      supabase
        .from('global_suppressions')
        .select('id, destination')
        .eq('owner_user_id', user.id)
        .is('resolved_at', null),
    ])

    const threads = buildMarketingThreads(events)
    const reviewRequired = campaigns.filter((campaign) => campaign.review_state === 'review_required').length
    const activeCampaigns = campaigns.filter((campaign) => ['active', 'launching'].includes(campaign.status)).length
    const lists = listsResult.data || []
    const suppressions = suppressionsResult.data || []

    const listNameById = new Map(lists.map((list) => [list.id, list.name]))
    const campaignDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        const [steps, enrollments] = await Promise.all([
          getCampaignSteps(campaign.id),
          getCampaignEnrollments(campaign.id),
        ])

        const eligibleCount = enrollments.filter(
          (enrollment) => (enrollment as { eligibility_status?: string }).eligibility_status === 'eligible'
        ).length
        const suppressedCount = enrollments.filter(
          (enrollment) => (enrollment as { eligibility_status?: string }).eligibility_status === 'suppressed'
        ).length
        const ineligibleCount = enrollments.filter(
          (enrollment) =>
            !['eligible', 'suppressed'].includes(
              (enrollment as { eligibility_status?: string }).eligibility_status || ''
            )
        ).length
        const draftPayload = ((campaign.draft_payload || {}) as Record<string, unknown>) || {}

        return {
          id: campaign.id,
          name: campaign.name,
          channel: campaign.channel,
          reviewState: campaign.review_state,
          launchState:
            campaign.status === 'active' || campaign.status === 'partially_failed' || campaign.status === 'failed'
              ? campaign.status
              : 'draft',
          audienceSourceType: campaign.audience_source_type || 'manual_segment',
          audienceSourceLabel: campaign.audience_source_id
            ? listNameById.get(campaign.audience_source_id) || 'Selected audience'
            : 'Audience not selected',
          audienceCount: enrollments.length,
          eligibleCount,
          suppressedCount,
          ineligibleCount,
          launchedAt: campaign.launched_at,
          lastReviewAt: campaign.updated_at,
          ownerLabel: actor.full_name || actor.email || 'Current owner',
          nextAction:
            campaign.review_state === 'approved'
              ? 'Launch when ready.'
              : campaign.review_state === 'review_required'
                ? 'Resolve blocked rows and re-run review.'
                : 'Save the draft, then run review.',
          reviewReasons: [
            suppressedCount > 0
              ? `${suppressedCount} recipients are globally suppressed.`
              : 'No suppressions matched.',
            ineligibleCount > 0
              ? `${ineligibleCount} rows are missing a destination or ownership match.`
              : 'Eligibility checks are clear.',
          ],
          draft: {
            subject: typeof draftPayload.subject === 'string' ? draftPayload.subject : '',
            message:
              typeof draftPayload.message === 'string'
                ? draftPayload.message
                : typeof draftPayload.body === 'string'
                  ? draftPayload.body
                  : '',
            voicemailAssetLabel:
              typeof draftPayload.voicemailAssetLabel === 'string'
                ? draftPayload.voicemailAssetLabel
                : 'None',
            templatePresetId:
              typeof draftPayload.templatePresetId === 'string'
                ? draftPayload.templatePresetId
                : '',
            templateLabel:
              typeof draftPayload.templateLabel === 'string'
                ? draftPayload.templateLabel
                : '',
          },
          steps: steps.map((step, index) => {
            const payload = ((step as { content_payload?: Record<string, unknown> }).content_payload || {}) as Record<string, unknown>
            const preview =
              typeof payload.preview === 'string'
                ? payload.preview
                : typeof payload.message === 'string'
                  ? payload.message
                  : typeof payload.subject === 'string'
                    ? payload.subject
                    : `${step.action_type} step`

            return {
              id: (step as { id: string }).id,
              order: index + 1,
              channel: (step as { channel: string }).channel,
              actionType:
                (step as { action_type?: string }).action_type === 'drop_voicemail'
                  ? 'voicemail'
                  : (step as { channel: string }).channel,
              templateLabel: (step as { template_label?: string | null }).template_label || `Step ${index + 1}`,
              preview,
              reviewState:
                (step as { review_state?: string }).review_state === 'approved'
                  ? 'ready'
                  : (step as { review_state?: string }).review_state === 'rejected'
                    ? 'suppressed'
                    : 'needs_review',
              executionStatus: (step as { execution_status?: string }).execution_status || 'queued',
              voicemailAssetLabel:
                typeof payload.voicemailAssetLabel === 'string' ? payload.voicemailAssetLabel : undefined,
            }
          }),
        }
      })
    )

    const propertyIds = Array.from(
      new Set(threads.map((thread) => thread.propertyId).filter((value): value is string => Boolean(value)))
    )
    const contactIds = Array.from(
      new Set(threads.map((thread) => thread.contactId).filter((value): value is string => Boolean(value)))
    )

    const [propertiesResult, contactsResult] = await Promise.all([
      propertyIds.length
        ? supabase.from('properties').select('id, address').in('id', propertyIds)
        : Promise.resolve({ data: [], error: null }),
      contactIds.length
        ? supabase.from('contacts').select('id, name').in('id', contactIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const propertyLabelById = new Map((propertiesResult.data || []).map((property) => [property.id, property.address]))
    const contactNameById = new Map((contactsResult.data || []).map((contact) => [contact.id, contact.name || 'Unknown contact']))

    const threadDetails = threads.map((thread) => {
      const threadEvents = events
        .filter((event) => event.threadKey === thread.id)
        .slice(0, 8)
        .map((event) => ({
          id: event.id,
          kind:
            event.channel === 'note'
              ? 'note'
              : event.channel === 'activity'
                ? 'activity'
                : event.status === 'review_required'
                  ? 'review'
                  : 'message',
          title: event.title,
          detail: event.content,
          at: event.createdAt,
        }))

      const status =
        thread.needsReply
          ? 'needs_reply'
          : thread.status === 'suppressed'
            ? 'suppressed'
            : thread.status === 'failed'
              ? 'failed'
              : thread.status === 'review_required'
                ? 'review_required'
                : thread.status === 'voicemail_left'
                  ? 'voicemail_left'
                  : thread.status === 'delivered'
                    ? 'delivered'
                    : thread.status === 'replied'
                      ? 'replied'
                      : 'sent'

      return {
        id: thread.id,
        contactName: thread.contactId
          ? contactNameById.get(thread.contactId) || 'Unknown contact'
          : 'Unknown contact',
        propertyLabel: thread.propertyId
          ? propertyLabelById.get(thread.propertyId) || 'Property unavailable'
          : 'No property linked',
        campaignName: 'Unified inbox',
        channel: thread.channel === 'mixed' ? 'sms' : thread.channel,
        status,
        preview: thread.preview,
        unreadCount: thread.unreadCount,
        needsReply: thread.needsReply,
        reviewRequired: status === 'review_required',
        suppressed: status === 'suppressed',
        lastEventAt: thread.lastEventAt,
        events: threadEvents,
      }
    })

    const importBatches = lists.map((list) => ({
      id: list.id,
      name: list.name,
      sourceType: 'csv',
      state: 'completed',
      totalRows: 0,
      importedRows: 0,
      skippedRows: 0,
      suppressedRows: 0,
      progress: 100,
      updatedAt: list.created_at,
      issues: list.description ? [list.description] : [],
    }))

    return apiSuccess({
      campaigns: campaignDetails.slice(0, 5),
      imports: importBatches.slice(0, 5),
      threads: threadDetails.slice(0, 8),
      analytics,
      lastSyncedAt: new Date().toISOString(),
      queue: {
        threads: threadDetails.slice(0, 8),
        unread: threads.reduce((sum, thread) => sum + thread.unreadCount, 0),
        needsReply: threads.filter((thread) => thread.needsReply).length,
        failed: threads.filter((thread) => thread.status === 'failed').length,
      },
      audience: {
        lists: lists.length,
        suppressions: suppressions.length,
      },
      nextActions: {
        reviewRequired,
        activeCampaigns,
        draftCampaigns: campaigns.filter((campaign) => campaign.status === 'draft').length,
      },
    })
  } catch (error) {
    console.error('Marketing command center bootstrap error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to load marketing command center.')
  }
})
