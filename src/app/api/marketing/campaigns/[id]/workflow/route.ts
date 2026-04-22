import { NextRequest } from 'next/server'
import { z } from 'zod'

import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import {
  buildWorkflowConsentSummary,
  buildWorkflowDraftFromRows,
  buildWorkflowStepRows,
  buildWorkflowVersionSummary,
  deriveWorkflowSummaryChannel,
  validateWorkflowDraft,
} from '@/lib/marketing/workflow'
import { getOwnedCampaign, resolveCampaignAudience } from '@/app/api/marketing/_lib'
import type { WorkflowEdge, WorkflowNode } from '@/types/marketing-workflow'

const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['sms', 'email', 'voicemail', 'wait', 'condition', 'exit']),
  laneKey: z.enum(['logic', 'sms', 'email', 'voicemail']),
  sequence: z.number().int().positive(),
  label: z.string().min(1).max(160),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  config: z.record(z.string(), z.unknown()),
  sourceStepId: z.string().nullable().optional(),
  readOnly: z.boolean().optional(),
})

const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  branchKey: z.enum(['default', 'true', 'false']),
  sourceStepEdgeId: z.string().nullable().optional(),
})

const UpdateWorkflowSchema = z.object({
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
})

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

async function safeSelectRows<T>(
  label: string,
  operation: PromiseLike<{ data: T[] | null; error: SupabaseErrorLike | null }>
) {
  const { data, error } = await operation

  if (error) {
    if (isMissingRelation(error)) {
      return [] as T[]
    }

    throw new Error(`${label}: ${error.message}`)
  }

  return data || []
}

async function safeMaybeSingle<T>(
  label: string,
  operation: PromiseLike<{ data: T | null; error: SupabaseErrorLike | null }>
) {
  const { data, error } = await operation

  if (error) {
    if (isMissingRelation(error)) {
      return null
    }

    throw new Error(`${label}: ${error.message}`)
  }

  return data
}

async function loadWorkflowState(campaignId: string) {
  const supabase = createAdminClient()
  const [steps, draftVersion, latestVersion] = await Promise.all([
    safeSelectRows(
      'workflow steps',
      supabase
        .from('campaign_steps')
        .select('*')
        .eq('campaign_id', campaignId)
        .is('version_id', null)
        .order('step_order', { ascending: true })
    ),
    safeMaybeSingle(
      'draft workflow version',
      supabase
        .from('campaign_workflow_versions')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('state', 'draft')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    safeMaybeSingle(
      'launched workflow version',
      supabase
        .from('campaign_workflow_versions')
        .select('*')
        .eq('campaign_id', campaignId)
        .in('state', ['snapshot', 'launched', 'archived'])
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
  ])

  return { steps, draftVersion, latestVersion }
}

async function buildConsentSummary(campaignId: string, ownerUserId: string) {
  const campaign = await getOwnedCampaign(campaignId, ownerUserId)
  if (!campaign) {
    throw new Error('Campaign not found.')
  }

  const audience = await resolveCampaignAudience(campaign)
  const propertyIds = audience.map((property) => property.id)
  if (propertyIds.length === 0) {
    return {
      sms: { granted: 0, denied: 0, unknown: 0, missingDestination: 0 },
      email: { granted: 0, denied: 0, unknown: 0, missingDestination: 0 },
    }
  }

  const supabase = createAdminClient()
  const contacts = await safeSelectRows(
    'workflow contacts',
    supabase
      .from('contacts')
      .select('id, property_id, phone_numbers, emails')
      .in('property_id', propertyIds)
  )

  return buildWorkflowConsentSummary(propertyIds, contacts as Array<{
    id: string
    property_id: string
    phone_numbers: unknown[] | null
    emails: unknown[] | null
  }>)
}

export const GET = withAuth(async (_request: NextRequest, { user, params }) => {
  try {
    const { id } = (await params) as { id: string }
    const campaign = await getOwnedCampaign(id, user.id)

    if (!campaign) {
      return Errors.notFound('Campaign')
    }

    const [{ steps, draftVersion, latestVersion }, consentSummary] = await Promise.all([
      loadWorkflowState(campaign.id),
      buildConsentSummary(campaign.id, user.id),
    ])

    const graphPayload =
      draftVersion && typeof (draftVersion as Record<string, unknown>).graph_payload === 'object'
        ? ((draftVersion as Record<string, unknown>).graph_payload as Record<string, unknown>)
        : null
    const payloadNodes = Array.isArray(graphPayload?.nodes)
      ? (graphPayload.nodes as WorkflowNode[])
      : []
    const payloadEdges = Array.isArray(graphPayload?.edges)
      ? (graphPayload.edges as WorkflowEdge[])
      : []

    const draft =
      payloadNodes.length > 0
        ? validateWorkflowDraft({
            nodes: payloadNodes,
            edges: payloadEdges,
            readOnly: false,
            convertedFromLegacy: false,
          })
        : buildWorkflowDraftFromRows(campaign, steps as Record<string, unknown>[], [])
    const latestVersionSummary = latestVersion
      ? buildWorkflowVersionSummary(
          latestVersion as Record<string, unknown>,
          draft.nodes,
          draft.edges
        )
      : campaign.launched_at
        ? {
            id: `${campaign.id}:legacy-launch`,
            campaignId: campaign.id,
            versionNumber: 1,
            status: campaign.status === 'active' ? 'active' : 'launched',
            launchedAt: campaign.launched_at,
            createdAt: campaign.created_at,
            createdByUserId: campaign.owner_user_id,
            nodeCount: draft.nodes.length,
            edgeCount: draft.edges.length,
            summary: {
              channel: deriveWorkflowSummaryChannel(draft.nodes),
              nodeKinds: draft.nodes.map((node) => node.kind),
            },
          }
        : null

    return apiSuccess({
      draft,
      latestVersion: latestVersionSummary,
      consentSummary,
    })
  } catch (error) {
    console.error('Workflow load error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to load workflow.')
  }
})

export const PUT = withAuth(async (request: NextRequest, { user, params }) => {
  try {
    const { id } = (await params) as { id: string }
    const campaign = await getOwnedCampaign(id, user.id)

    if (!campaign) {
      return Errors.notFound('Campaign')
    }

    const parsed = UpdateWorkflowSchema.safeParse(await request.json())
    if (!parsed.success) {
      return Errors.badRequest('Invalid workflow payload.')
    }

    const normalizedDraft = validateWorkflowDraft({
      nodes: parsed.data.nodes as WorkflowNode[],
      edges: parsed.data.edges as WorkflowEdge[],
      readOnly: false,
      convertedFromLegacy: false,
    })
    const supabase = createAdminClient()
    const existingDraftVersion = await safeMaybeSingle(
      'existing draft workflow version',
      supabase
        .from('campaign_workflow_versions')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('state', 'draft')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    )

    let draftVersionId = existingDraftVersion
      ? String((existingDraftVersion as Record<string, unknown>).id)
      : null

    if (!draftVersionId) {
      const { data: nextVersionNumber, error: versionNumberError } = await supabase.rpc(
        'next_campaign_workflow_version_number',
        {
          p_campaign_id: campaign.id,
        }
      )

      if (versionNumberError) {
        return Errors.internal(versionNumberError.message)
      }

      const { data: insertedDraftVersion, error: insertDraftVersionError } = await supabase
        .from('campaign_workflow_versions')
        .insert({
          campaign_id: campaign.id,
          version_number: typeof nextVersionNumber === 'number' ? nextVersionNumber : 1,
          state: 'draft',
          created_by: user.id,
          graph_payload: {
            nodes: normalizedDraft.nodes,
            edges: normalizedDraft.edges,
            summary: {
              channel: deriveWorkflowSummaryChannel(normalizedDraft.nodes),
              nodeKinds: normalizedDraft.nodes.map((node) => node.kind),
            },
          },
        })
        .select('*')
        .single()

      if (insertDraftVersionError || !insertedDraftVersion) {
        return Errors.internal(insertDraftVersionError?.message || 'Failed to create draft workflow version.')
      }

      draftVersionId = String((insertedDraftVersion as Record<string, unknown>).id)
    } else {
      const { error: updateDraftVersionError } = await supabase
        .from('campaign_workflow_versions')
        .update({
          graph_payload: {
            nodes: normalizedDraft.nodes,
            edges: normalizedDraft.edges,
            summary: {
              channel: deriveWorkflowSummaryChannel(normalizedDraft.nodes),
              nodeKinds: normalizedDraft.nodes.map((node) => node.kind),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', draftVersionId)

      if (updateDraftVersionError) {
        return Errors.internal(updateDraftVersionError.message)
      }
    }

    const { error: deleteStepsError } = await supabase
      .from('campaign_steps')
      .delete()
      .eq('campaign_id', campaign.id)
      .is('version_id', null)

    if (deleteStepsError) {
      return Errors.internal(deleteStepsError.message)
    }

    if (normalizedDraft.nodes.length > 0) {
      const { error: stepInsertError } = await supabase
        .from('campaign_steps')
        .insert(
          buildWorkflowStepRows({
            campaignId: campaign.id,
            nodes: normalizedDraft.nodes,
          })
        )

      if (stepInsertError) {
        return Errors.internal(stepInsertError.message)
      }
    }

    const nextChannel = deriveWorkflowSummaryChannel(normalizedDraft.nodes)
    const { error: campaignUpdateError } = await supabase
      .from('campaigns')
      .update({
        channel: nextChannel,
        review_state: 'draft',
        status: 'draft',
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .eq('owner_user_id', user.id)

    if (campaignUpdateError) {
      return Errors.internal(campaignUpdateError.message)
    }

    const consentSummary = await buildConsentSummary(campaign.id, user.id)
    const latestVersion = await safeMaybeSingle(
      'latest launched workflow version',
      supabase
        .from('campaign_workflow_versions')
        .select('*')
        .eq('campaign_id', campaign.id)
        .in('state', ['snapshot', 'launched', 'archived'])
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    )

    return apiSuccess({
      draft: normalizedDraft,
      latestVersion: latestVersion
        ? buildWorkflowVersionSummary(
            latestVersion as Record<string, unknown>,
            normalizedDraft.nodes,
            normalizedDraft.edges
          )
        : null,
      consentSummary,
    })
  } catch (error) {
    console.error('Workflow save error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to save workflow.')
  }
})
