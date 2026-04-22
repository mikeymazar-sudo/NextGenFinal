import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'

import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import {
  buildCampaignReview,
  getCampaignEnrollments,
  getCampaignSteps,
  getOwnedCampaign,
} from '@/app/api/marketing/_lib'
import {
  normalizeDestinationEntries,
} from '@/lib/marketing/destination-consent'
import {
  buildWorkflowDraftFromRows,
  buildWorkflowEdgeRows,
  buildWorkflowStepRows,
  deriveWorkflowSummaryChannel,
  getWorkflowEntryNode,
  validateWorkflowDraft,
} from '@/lib/marketing/workflow'
import { normalizeEmailAddress } from '@/lib/marketing/communications'
import { normalizePhoneNumber } from '@/lib/utils'

type PropertyRow = {
  id: string
  address: string
  owner_name: string | null
  owner_phone: string[] | null
  raw_realestate_data: Record<string, unknown> | null
}

type ContactRow = {
  id: string
  property_id: string
  name: string | null
  phone_numbers: unknown[] | null
  emails: unknown[] | null
}

type SupabaseErrorLike = {
  code?: string
  message: string
}

function isMissingRelation(error: SupabaseErrorLike | null) {
  if (!error) return false

  return (
    error.code === '42P01' ||
    error.message.toLowerCase().includes('does not exist') ||
    error.message.toLowerCase().includes('schema cache')
  )
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function pickPropertyPhone(property: PropertyRow) {
  const direct = property.owner_phone?.find((value) => typeof value === 'string' && value.trim()) || null
  const normalizedDirect = normalizePhoneNumber(direct || '')
  if (normalizedDirect) {
    return normalizedDirect
  }

  const raw = coerceRecord(property.raw_realestate_data)
  const data = coerceRecord(raw?.data)
  const ownerInfo = coerceRecord(data?.ownerInfo)
  return normalizePhoneNumber((ownerInfo?.phone as string | undefined) || '')
}

function pickPropertyEmail(property: PropertyRow) {
  const raw = coerceRecord(property.raw_realestate_data)
  const data = coerceRecord(raw?.data)
  const ownerInfo = coerceRecord(data?.ownerInfo)
  const email =
    typeof ownerInfo?.email === 'string'
      ? ownerInfo.email
      : typeof ownerInfo?.emailAddress === 'string'
        ? ownerInfo.emailAddress
        : null

  return normalizeEmailAddress(email)
}

function getPhoneDestination(contact: ContactRow | null, property: PropertyRow) {
  const entries = normalizeDestinationEntries(contact?.phone_numbers || [], 'sms', {
    defaultConsentSource: 'legacy',
  })

  const primaryEntry =
    entries.find((entry) => entry.is_primary) ||
    entries.find((entry) => normalizePhoneNumber(entry.value)) ||
    null
  const propertyFallback = pickPropertyPhone(property)

  return {
    destination: primaryEntry?.value ? normalizePhoneNumber(primaryEntry.value) : propertyFallback,
    consent: primaryEntry,
  }
}

function getEmailDestination(contact: ContactRow | null, property: PropertyRow) {
  const entries = normalizeDestinationEntries(contact?.emails || [], 'email', {
    defaultConsentSource: 'legacy',
  })

  const primaryEntry =
    entries.find((entry) => entry.is_primary) ||
    entries.find((entry) => normalizeEmailAddress(entry.value)) ||
    null
  const propertyFallback = pickPropertyEmail(property)

  return {
    destination: primaryEntry?.value ? normalizeEmailAddress(primaryEntry.value) : propertyFallback,
    consent: primaryEntry,
  }
}

async function safeMaybeSingle<T>(
  operation: PromiseLike<{ data: T | null; error: SupabaseErrorLike | null }>
) {
  const { data, error } = await operation

  if (error) {
    if (isMissingRelation(error)) {
      return null
    }

    throw new Error(error.message)
  }

  return data
}

async function refreshCampaignEnrollments(campaignId: string, ownerUserId: string) {
  const campaign = await getOwnedCampaign(campaignId, ownerUserId)
  if (!campaign) {
    throw new Error('Campaign not found.')
  }

  const review = await buildCampaignReview(campaign)
  const supabase = createAdminClient()

  await supabase.from('campaign_enrollments').delete().eq('campaign_id', campaign.id)

  if (review.reviewRows.length > 0) {
    const { error } = await supabase.from('campaign_enrollments').insert(
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

    if (error) {
      throw new Error(error.message)
    }
  }

  return {
    review,
    enrollments: await getCampaignEnrollments(campaign.id),
  }
}

async function loadLaunchDraft(campaignId: string, ownerUserId: string) {
  const campaign = await getOwnedCampaign(campaignId, ownerUserId)
  if (!campaign) {
    throw new Error('Campaign not found.')
  }

  const supabase = createAdminClient()
  const [draftVersion, legacySteps] = await Promise.all([
    safeMaybeSingle(
      supabase
        .from('campaign_workflow_versions')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('state', 'draft')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    getCampaignSteps(campaign.id),
  ])

  const graphPayload =
    draftVersion && typeof (draftVersion as Record<string, unknown>).graph_payload === 'object'
      ? ((draftVersion as Record<string, unknown>).graph_payload as Record<string, unknown>)
      : null

  if (Array.isArray(graphPayload?.nodes) && graphPayload.nodes.length > 0) {
    return validateWorkflowDraft({
      nodes: graphPayload.nodes as Parameters<typeof validateWorkflowDraft>[0]['nodes'],
      edges: Array.isArray(graphPayload?.edges) ? (graphPayload.edges as Parameters<typeof validateWorkflowDraft>[0]['edges']) : [],
      readOnly: false,
      convertedFromLegacy: false,
    })
  }

  return buildWorkflowDraftFromRows(campaign, legacySteps as Record<string, unknown>[], [])
}

export const POST = withAuth(async (_request: NextRequest, { user, params }) => {
  try {
    const { id } = (await params) as { id: string }
    const campaign = await getOwnedCampaign(id, user.id)

    if (!campaign) {
      return Errors.notFound('Campaign')
    }

    if (campaign.review_state !== 'approved') {
      return Errors.badRequest('Campaign must be reviewed and approved before launch.')
    }

    const [draft, refreshed] = await Promise.all([
      loadLaunchDraft(campaign.id, user.id),
      refreshCampaignEnrollments(campaign.id, user.id),
    ])
    const eligibleEnrollments = refreshed.enrollments.filter(
      (enrollment) => (enrollment as { eligibility_status?: string }).eligibility_status === 'eligible'
    )

    if (eligibleEnrollments.length === 0) {
      return Errors.badRequest('Campaign has no eligible enrollments to launch.')
    }

    const entryNode = getWorkflowEntryNode(draft.nodes, draft.edges)
    const firstDeliveryNode =
      draft.nodes.find((node) => node.kind === 'sms' || node.kind === 'email' || node.kind === 'voicemail') || entryNode

    if (!entryNode || !firstDeliveryNode) {
      return Errors.badRequest('Workflow is missing a launchable entry step.')
    }

    const supabase = createAdminClient()
    const propertyIds = Array.from(
      new Set(
        eligibleEnrollments
          .map((enrollment) => (enrollment as { property_id?: string | null }).property_id)
          .filter((value): value is string => Boolean(value))
      )
    )
    const contactIds = Array.from(
      new Set(
        eligibleEnrollments
          .map((enrollment) => (enrollment as { contact_id?: string | null }).contact_id)
          .filter((value): value is string => Boolean(value))
      )
    )

    const [{ data: properties }, { data: contacts }] = await Promise.all([
      propertyIds.length
        ? supabase
            .from('properties')
            .select('id, address, owner_name, owner_phone, raw_realestate_data')
            .in('id', propertyIds)
        : Promise.resolve({ data: [] as PropertyRow[] }),
      contactIds.length
        ? supabase
            .from('contacts')
            .select('id, property_id, name, phone_numbers, emails')
            .in('id', contactIds)
        : Promise.resolve({ data: [] as ContactRow[] }),
    ])

    const propertyById = new Map((properties || []).map((property) => [property.id, property as PropertyRow]))
    const contactById = new Map((contacts || []).map((contact) => [contact.id, contact as ContactRow]))
    const stepIdMap = new Map(draft.nodes.map((node) => [node.id, randomUUID()]))
    const { data: nextVersionNumber, error: versionNumberError } = await supabase.rpc(
      'next_campaign_workflow_version_number',
      {
        p_campaign_id: campaign.id,
      }
    )

    if (versionNumberError) {
      return Errors.internal(versionNumberError.message)
    }

    const now = new Date().toISOString()
    const { data: workflowVersion, error: workflowVersionError } = await supabase
      .from('campaign_workflow_versions')
      .insert({
        campaign_id: campaign.id,
        version_number: typeof nextVersionNumber === 'number' ? nextVersionNumber : 1,
        state: 'launched',
        entry_step_id: null,
        graph_payload: {
          nodes: draft.nodes,
          edges: draft.edges,
          summary: {
            channel: deriveWorkflowSummaryChannel(draft.nodes),
            nodeKinds: draft.nodes.map((node) => node.kind),
          },
        },
        created_by: user.id,
        launched_at: now,
      })
      .select('*')
      .single()

    if (workflowVersionError || !workflowVersion) {
      return Errors.internal(workflowVersionError?.message || 'Failed to create workflow snapshot.')
    }

    const versionId = String((workflowVersion as Record<string, unknown>).id)
    const versionedStepRows = buildWorkflowStepRows({
      campaignId: campaign.id,
      versionId,
      nodes: draft.nodes,
      idMap: stepIdMap,
    })
    const { error: stepInsertError } = await supabase
      .from('campaign_steps')
      .insert(versionedStepRows)

    if (stepInsertError) {
      return Errors.internal(stepInsertError.message)
    }

    if (draft.edges.length > 0) {
      const versionedEdges = draft.edges.map((edge) => ({
        ...edge,
        sourceNodeId: stepIdMap.get(edge.sourceNodeId) || edge.sourceNodeId,
        targetNodeId: stepIdMap.get(edge.targetNodeId) || edge.targetNodeId,
      }))

      const { error: edgeInsertError } = await supabase
        .from('campaign_step_edges')
        .insert(
          buildWorkflowEdgeRows({
            versionId,
            edges: versionedEdges,
          })
        )

      if (edgeInsertError) {
        return Errors.internal(edgeInsertError.message)
      }
    }

    const { error: versionUpdateError } = await supabase
      .from('campaign_workflow_versions')
      .update({
        entry_step_id: stepIdMap.get(entryNode.id) || null,
        updated_at: now,
      })
      .eq('id', versionId)

    if (versionUpdateError) {
      return Errors.internal(versionUpdateError.message)
    }

    const primaryChannel =
      firstDeliveryNode.kind === 'email'
        ? 'email'
        : firstDeliveryNode.kind === 'voicemail'
          ? 'voice'
          : 'sms'

    const contactRunRows = eligibleEnrollments.flatMap((enrollment) => {
      const propertyId = (enrollment as { property_id: string }).property_id
      const contactId = (enrollment as { contact_id?: string | null }).contact_id || null
      const property = propertyById.get(propertyId)
      const contact = contactId ? contactById.get(contactId) || null : null

      if (!property) {
        return []
      }

      const smsDestination = getPhoneDestination(contact, property)
      const emailDestination = getEmailDestination(contact, property)
      const voiceDestination = getPhoneDestination(contact, property)
      const primaryDestination =
        primaryChannel === 'email'
          ? emailDestination
          : primaryChannel === 'voice'
            ? voiceDestination
            : smsDestination

      if (!primaryDestination.destination) {
        return []
      }

      return [{
        campaign_id: campaign.id,
        workflow_version_id: versionId,
        campaign_enrollment_id: (enrollment as { id: string }).id,
        owner_user_id: user.id,
        property_id: propertyId,
        contact_id: contactId,
        primary_channel: primaryChannel,
        destination: primaryDestination.destination,
        consent_status:
          primaryChannel === 'voice'
            ? (primaryDestination.consent?.consent_status || 'granted')
            : (primaryDestination.consent?.consent_status || 'unknown'),
        consent_source: primaryDestination.consent?.consent_source || 'legacy',
        consent_updated_at: primaryDestination.consent?.consent_updated_at || null,
        status: 'queued',
        current_step_order: entryNode.sequence,
        next_due_at: now,
        launched_at: now,
        execution_context: {
          launch_snapshot: {
            campaign_id: campaign.id,
            workflow_version_id: versionId,
            launched_at: now,
          },
          contact: {
            id: contactId,
            name: contact?.name || property.owner_name || null,
          },
          property: {
            id: property.id,
            address: property.address,
          },
          destinations: {
            sms: smsDestination.destination
              ? {
                  destination: smsDestination.destination,
                  consent_status: smsDestination.consent?.consent_status || 'unknown',
                  consent_source: smsDestination.consent?.consent_source || 'legacy',
                  consent_updated_at: smsDestination.consent?.consent_updated_at || null,
                }
              : null,
            email: emailDestination.destination
              ? {
                  destination: emailDestination.destination,
                  consent_status: emailDestination.consent?.consent_status || 'unknown',
                  consent_source: emailDestination.consent?.consent_source || 'legacy',
                  consent_updated_at: emailDestination.consent?.consent_updated_at || null,
                }
              : null,
            voice: voiceDestination.destination
              ? {
                  destination: voiceDestination.destination,
                  consent_status: voiceDestination.consent?.consent_status || 'granted',
                  consent_source: voiceDestination.consent?.consent_source || 'system',
                  consent_updated_at: voiceDestination.consent?.consent_updated_at || null,
                }
              : null,
          },
        },
      }]
    })

    if (contactRunRows.length === 0) {
      return Errors.badRequest('No eligible contact runs could be seeded for launch.')
    }

    const { data: contactRuns, error: contactRunsError } = await supabase
      .from('campaign_contact_runs')
      .insert(contactRunRows)
      .select('id, campaign_enrollment_id')

    if (contactRunsError || !contactRuns) {
      return Errors.internal(contactRunsError?.message || 'Failed to create contact runs.')
    }

    const mappedEntryStepId = stepIdMap.get(entryNode.id)
    if (!mappedEntryStepId) {
      return Errors.internal('Failed to resolve launch entry step id.')
    }

    for (const contactRun of contactRuns) {
      const idempotencyKey = [versionId, contactRun.id, mappedEntryStepId, 'launch'].join(':')
      const { error: enqueueError } = await supabase.rpc('enqueue_campaign_step_run', {
        p_campaign_id: campaign.id,
        p_workflow_version_id: versionId,
        p_campaign_contact_run_id: contactRun.id,
        p_campaign_step_id: mappedEntryStepId,
        p_step_order: entryNode.sequence,
        p_node_kind: entryNode.kind,
        p_lane_key: entryNode.laneKey,
        p_scheduled_for: now,
        p_idempotency_key: idempotencyKey,
        p_input_payload: {
          source: 'launch',
          campaign_enrollment_id: contactRun.campaign_enrollment_id,
        },
        p_output_payload: {},
        p_status: 'queued',
        p_provider_reference: null,
        p_next_step_order: null,
      })

      if (enqueueError) {
        return Errors.internal(enqueueError.message)
      }
    }

    const queued = contactRuns.length
    const suppressed = refreshed.enrollments.filter(
      (enrollment) => (enrollment as { eligibility_status?: string }).eligibility_status === 'suppressed'
    ).length
    const skipped = refreshed.enrollments.length - queued - suppressed

    const { error: campaignUpdateError } = await supabase
      .from('campaigns')
      .update({
        channel: deriveWorkflowSummaryChannel(draft.nodes),
        review_state: 'approved',
        status: 'active',
        launch_state: 'queued',
        launched_at: campaign.launched_at || now,
        updated_at: now,
      })
      .eq('id', campaign.id)
      .eq('owner_user_id', user.id)

    if (campaignUpdateError) {
      return Errors.internal(campaignUpdateError.message)
    }

    return apiSuccess({
      campaignId: campaign.id,
      workflowVersionId: versionId,
      launchState: 'queued',
      queued,
      sent: 0,
      failed: 0,
      suppressed,
      skipped,
    })
  } catch (error) {
    console.error('Campaign launch error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to launch campaign.')
  }
})
