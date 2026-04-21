import { NextRequest } from 'next/server'
import { RestClient } from '@/lib/signalwire/compatibility-api'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import {
  getCampaignEnrollments,
  getCampaignSteps,
  getMarketingActorProfile,
  getOwnedCampaign,
} from '@/app/api/marketing/_lib'
import { normalizePhoneNumber } from '@/lib/utils'
import { sendSMS } from '@/lib/twilio/sms'
import { sendEmailFrom } from '@/lib/email/resend'
import { baseEmailTemplate } from '@/lib/email/templates'
import {
  normalizeEmailAddress,
  recordOutboundEmailCommunication,
} from '@/lib/marketing/communications'
import { checkMarketingSuppression } from '@/lib/marketing/suppression'
import { ensureUserPhoneNumberForUser } from '@/lib/signalwire/user-phone-numbers'

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

function getSignalWireClient() {
  const projectId = process.env.SIGNALWIRE_PROJECT_ID
  const apiToken = process.env.SIGNALWIRE_API_TOKEN
  const spaceUrl = process.env.SIGNALWIRE_SPACE_URL

  if (!projectId || !apiToken || !spaceUrl) {
    throw new Error('Voice service is not configured.')
  }

  return RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl })
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function extractEntryValue(entry: unknown) {
  if (typeof entry === 'string') {
    return entry.trim() || null
  }

  const record = coerceRecord(entry)
  const value = record?.value
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function pickContactPhone(contact: ContactRow | null) {
  const values = contact?.phone_numbers || []

  for (const entry of values) {
    const normalized = normalizePhoneNumber(extractEntryValue(entry) || '')
    if (normalized) return normalized
  }

  return null
}

function pickContactEmail(contact: ContactRow | null) {
  const values = contact?.emails || []

  for (const entry of values) {
    const normalized = normalizeEmailAddress(extractEntryValue(entry))
    if (normalized) return normalized
  }

  return null
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

function getDraftString(payload: Record<string, unknown> | null, key: string) {
  const value = payload?.[key]
  return typeof value === 'string' ? value : null
}

function isHttpUrl(value: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value))
}

export const POST = withAuth(async (request: NextRequest, { user, params }) => {
  try {
    const { id } = (await params) as { id: string }
    const campaign = await getOwnedCampaign(id, user.id)

    if (!campaign) {
      return Errors.notFound('Campaign')
    }

    const enrollments = await getCampaignEnrollments(campaign.id)
    const eligibleEnrollments = enrollments.filter(
      (enrollment) => (enrollment as { eligibility_status?: string }).eligibility_status === 'eligible'
    )

    if (eligibleEnrollments.length === 0) {
      return Errors.badRequest('Campaign has no eligible enrollments to launch.')
    }

    const supabase = createAdminClient()
    const actor = await getMarketingActorProfile(user.id, user.email)
    const draftPayload = (campaign.draft_payload || {}) as Record<string, unknown>
    const steps = await getCampaignSteps(campaign.id)

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

    const subject = getDraftString(draftPayload, 'subject') || `${campaign.name} update`
    const message = getDraftString(draftPayload, 'message') || ''
    const voicemailUrlFromDraft =
      getDraftString(draftPayload, 'voicemailUrl') ||
      getDraftString(draftPayload, 'voicemailAssetUrl')
    const voiceStep = steps.find((step) => (step as { channel?: string }).channel === 'voice')
    const voicePayload = ((voiceStep as { content_payload?: Record<string, unknown> } | undefined)?.content_payload || {}) as Record<string, unknown>
    const voicemailUrl =
      voicemailUrlFromDraft ||
      getDraftString(voicePayload, 'voicemailUrl') ||
      getDraftString(voicePayload, 'voicemailAssetUrl')

    let queued = 0
    let sent = 0
    let failed = 0
    let suppressed = enrollments.filter(
      (enrollment) => (enrollment as { eligibility_status?: string }).eligibility_status === 'suppressed'
    ).length
    const skipped = enrollments.length - eligibleEnrollments.length

    await supabase
      .from('campaigns')
      .update({
        review_state: 'approved',
        status: 'launching',
        launch_state: 'launching',
        launched_at: campaign.launched_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .eq('owner_user_id', user.id)

    const voiceAssignment =
      campaign.channel === 'voice'
        ? await ensureUserPhoneNumberForUser({
            userId: user.id,
            userEmail: user.email,
            fullName: actor.full_name,
            request,
          })
        : null

    for (const enrollment of eligibleEnrollments) {
      const enrollmentId = (enrollment as { id: string }).id
      const propertyId = (enrollment as { property_id: string }).property_id
      const contactId = (enrollment as { contact_id?: string | null }).contact_id || null
      const property = propertyById.get(propertyId)
      const contact = contactId ? contactById.get(contactId) || null : null

      if (!property) {
        failed += 1
        await supabase
          .from('campaign_enrollments')
          .update({
            review_state: 'approved',
            delivery_status: 'failed',
            latest_channel: campaign.channel,
          })
          .eq('id', enrollmentId)
        continue
      }

      if (campaign.channel === 'sms') {
        const destination = pickContactPhone(contact) || pickPropertyPhone(property)
        if (!destination) {
          failed += 1
          await supabase
            .from('campaign_enrollments')
            .update({
              review_state: 'approved',
              delivery_status: 'failed',
              latest_channel: 'sms',
            })
            .eq('id', enrollmentId)
          continue
        }

        const result = await sendSMS({
          userId: user.id,
          userEmail: user.email,
          fullName: actor.full_name,
          ownerUserId: user.id,
          to: destination,
          body: message,
          contactId: contactId || undefined,
          propertyId,
          request,
        })

        const deliveryStatus =
          result.errorCode === 'SUPPRESSED'
            ? 'suppressed'
            : result.success
              ? 'sent'
              : 'failed'

        if (deliveryStatus === 'suppressed') suppressed += 1
        else if (deliveryStatus === 'sent') sent += 1
        else failed += 1

        await supabase
          .from('campaign_enrollments')
          .update({
            review_state: 'approved',
            delivery_status: deliveryStatus,
            latest_channel: 'sms',
            last_communication_id: result.messageId || null,
          })
          .eq('id', enrollmentId)

        continue
      }

      if (campaign.channel === 'email') {
        const destination = pickContactEmail(contact) || pickPropertyEmail(property)
        if (!destination) {
          failed += 1
          await supabase
            .from('campaign_enrollments')
            .update({
              review_state: 'approved',
              delivery_status: 'failed',
              latest_channel: 'email',
            })
            .eq('id', enrollmentId)
          continue
        }

        const suppressionCheck = await checkMarketingSuppression({
          channel: 'email',
          destination,
          ownerUserId: user.id,
          propertyId,
          contactId,
        })

        if (!suppressionCheck.allowed) {
          suppressed += 1
          await supabase
            .from('campaign_enrollments')
            .update({
              review_state: 'approved',
              delivery_status: 'suppressed',
              latest_channel: 'email',
            })
            .eq('id', enrollmentId)
          continue
        }

        const html = message.includes('<html') ? message : baseEmailTemplate(message)
        const emailResult = await sendEmailFrom(actor.full_name || actor.email || 'NextGen Realty', {
          to: destination,
          subject,
          html,
          ...(actor.email ? { replyTo: actor.email } : {}),
        })

        if (!emailResult.success) {
          failed += 1
          await supabase
            .from('campaign_enrollments')
            .update({
              review_state: 'approved',
              delivery_status: 'failed',
              latest_channel: 'email',
            })
            .eq('id', enrollmentId)
          continue
        }

        const logResult = await recordOutboundEmailCommunication({
          userId: user.id,
          propertyId,
          to: destination,
          subject,
          content: html,
          status: 'sent',
          supabase,
        })

        sent += 1
        await supabase
          .from('campaign_enrollments')
          .update({
            review_state: 'approved',
            delivery_status: 'sent',
            latest_channel: 'email',
            last_communication_id: logResult.success ? logResult.data?.id || null : null,
          })
          .eq('id', enrollmentId)

        continue
      }

      const destination = pickContactPhone(contact) || pickPropertyPhone(property)
      const canSendVoice =
        Boolean(destination) &&
        Boolean(voiceAssignment?.phone_number) &&
        isHttpUrl(voicemailUrl)

      if (!destination) {
        failed += 1
        await supabase
          .from('campaign_enrollments')
          .update({
            review_state: 'approved',
            delivery_status: 'failed',
            latest_channel: 'voice',
          })
          .eq('id', enrollmentId)
        continue
      }

      if (!canSendVoice) {
        queued += 1
        await supabase
          .from('campaign_enrollments')
          .update({
            review_state: 'approved',
            delivery_status: 'queued',
            latest_channel: 'voice',
          })
          .eq('id', enrollmentId)
        continue
      }

      try {
        const outboundUrl = new URL('/api/voice/outbound', request.url)
        outboundUrl.searchParams.set('Mode', 'voicemail')
        outboundUrl.searchParams.set('VoicemailUrl', voicemailUrl as string)

        const statusCallbackUrl = new URL('/api/voice/webhook', request.url)
        statusCallbackUrl.searchParams.set('CampaignId', campaign.id)
        statusCallbackUrl.searchParams.set('PropertyId', propertyId)
        if (contactId) {
          statusCallbackUrl.searchParams.set('ContactId', contactId)
        }
        statusCallbackUrl.searchParams.set('Mode', 'voicemail')
        statusCallbackUrl.searchParams.set('VoicemailUrl', voicemailUrl as string)

        const call = await getSignalWireClient().calls.create({
          to: destination,
          from: voiceAssignment?.phone_number as string,
          url: outboundUrl.toString(),
          method: 'POST',
          statusCallback: statusCallbackUrl.toString(),
          statusCallbackMethod: 'POST',
        })

        const { data: callRow } = await supabase
          .from('calls')
          .insert({
            caller_id: user.id,
            user_phone_number_id: voiceAssignment?.id || null,
            contact_id: contactId,
            property_id: propertyId,
            from_number: voiceAssignment?.phone_number || null,
            to_number: destination,
            status: 'queued',
            notes: `Marketing voicemail: ${campaign.name}`,
            twilio_call_sid: (call as { sid?: string }).sid || null,
          })
          .select('id')
          .maybeSingle()

        queued += 1
        await supabase
          .from('campaign_enrollments')
          .update({
            review_state: 'approved',
            delivery_status: 'queued',
            latest_channel: 'voice',
            last_communication_id: callRow?.id || null,
          })
          .eq('id', enrollmentId)
      } catch (error) {
        console.error('Voice launch error:', error)
        failed += 1
        await supabase
          .from('campaign_enrollments')
          .update({
            review_state: 'approved',
            delivery_status: 'failed',
            latest_channel: 'voice',
          })
          .eq('id', enrollmentId)
      }
    }

    const finalStatus =
      failed > 0 && sent + queued > 0
        ? 'partially_failed'
        : failed > 0
          ? 'failed'
          : 'active'

    await supabase
      .from('campaigns')
      .update({
        status: finalStatus,
        launch_state: queued > 0 && sent === 0 ? 'queued' : finalStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .eq('owner_user_id', user.id)

    return apiSuccess({
      campaignId: campaign.id,
      launchState: queued > 0 && sent === 0 ? 'queued' : finalStatus,
      queued,
      sent,
      failed,
      suppressed,
      skipped,
    })
  } catch (error) {
    console.error('Campaign launch error:', error)
    return Errors.internal(error instanceof Error ? error.message : 'Failed to launch campaign.')
  }
})
