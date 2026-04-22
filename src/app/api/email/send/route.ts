import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiError, apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmailFrom } from '@/lib/email/resend'
import {
  propertyDetailsTemplate,
  followUpTemplate,
  offerTemplate,
  baseEmailTemplate,
} from '@/lib/email/templates'
import { requirePropertyOwnership } from '@/lib/marketing/ownership'
import {
  normalizeEmailAddress,
  normalizeEmailProviderStatus,
  recordOutboundEmailCommunication,
} from '@/lib/marketing/communications'
import { evaluateDestinationConsent } from '@/lib/marketing/destination-consent'
import { checkMarketingSuppression } from '@/lib/marketing/suppression'

const SendEmailSchema = z.object({
  to: z.string().email(),
  template: z.enum(['property_details', 'follow_up', 'offer_sent', 'custom']),
  propertyId: z.string().uuid().optional(),
  subject: z.string().optional(),
  customHtml: z.string().optional(),
  replyTo: z.string().email().optional(),
  message: z.string().optional(),
  offerAmount: z.number().positive().optional(),
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return Errors.badRequest('Invalid JSON body.')
    }

    const parsed = SendEmailSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid input. Provide to, template, and optionally propertyId.')
    }

    const {
      to,
      template,
      propertyId,
      subject: customSubject,
      customHtml,
      replyTo,
      message,
      offerAmount,
    } = parsed.data

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, 'send-email')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // Get sender profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    const senderName = profile?.full_name || profile?.email || 'NextGen Realty'
    const agentEmail = normalizeEmailAddress(replyTo || profile?.email || null)

    let property: Record<string, unknown> | null = null
    if (propertyId) {
      const propertyAccess = await requirePropertyOwnership(user.id, propertyId, { supabase })
      if (!propertyAccess.ok) {
        return propertyAccess.response
      }

      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single()

      if (error) {
        return Errors.internal(error.message)
      }

      property = data
    }

    let emailSubject: string
    let emailHtml: string

    if (template === 'custom') {
      emailSubject = customSubject || 'Message from NextGen Realty'
      // Wrap plain HTML in the branded base template if it looks like plain text (no html tag)
      const rawHtml = customHtml || ''
      emailHtml = rawHtml.includes('<html') ? rawHtml : baseEmailTemplate(rawHtml)
    } else if (template === 'property_details' && property) {
      const rendered = propertyDetailsTemplate(
        {
          address: String(property.address || ''),
          city: property.city ? String(property.city) : undefined,
          state: property.state ? String(property.state) : undefined,
          zip: property.zip ? String(property.zip) : undefined,
          price: property.list_price ? Number(property.list_price) : undefined,
          bedrooms: property.bedrooms ? Number(property.bedrooms) : undefined,
          bathrooms: property.bathrooms ? Number(property.bathrooms) : undefined,
          sqft: property.sqft ? Number(property.sqft) : undefined,
        },
        senderName
      )
      emailSubject = customSubject || rendered.subject
      emailHtml = rendered.html
    } else if (template === 'follow_up') {
      const propertyAddress = property
        ? String(property.address || '')
        : 'the property we discussed'
      const ownerName = property?.owner_name ? String(property.owner_name) : null
      const rendered = followUpTemplate(
        propertyAddress,
        ownerName,
        message || 'I wanted to follow up and see if you had any questions.',
        senderName
      )
      emailSubject = customSubject || rendered.subject
      emailHtml = rendered.html
    } else if (template === 'offer_sent' && property) {
      const ownerName = property?.owner_name ? String(property.owner_name) : null
      const rendered = offerTemplate(
        {
          address: String(property.address || ''),
          city: property.city ? String(property.city) : undefined,
          state: property.state ? String(property.state) : undefined,
          zip: property.zip ? String(property.zip) : undefined,
          price: property.list_price ? Number(property.list_price) : undefined,
          bedrooms: property.bedrooms ? Number(property.bedrooms) : undefined,
          bathrooms: property.bathrooms ? Number(property.bathrooms) : undefined,
          sqft: property.sqft ? Number(property.sqft) : undefined,
        },
        offerAmount || 0,
        ownerName,
        senderName,
        message || undefined
      )
      emailSubject = customSubject || rendered.subject
      emailHtml = rendered.html
    } else {
      // Fallback: send a basic branded email with whatever we have
      emailSubject = customSubject || 'Message from NextGen Realty'
      emailHtml = baseEmailTemplate(customHtml || message || '')
    }

    const normalizedRecipient = normalizeEmailAddress(to)
    if (!normalizedRecipient) {
      return Errors.badRequest('Invalid email address.')
    }

    const suppression = await checkMarketingSuppression({
      channel: 'email',
      destination: normalizedRecipient,
      ownerUserId: user.id,
    })

    if (!suppression.allowed) {
      return apiError(
        'Destination is globally suppressed for email.',
        'SUPPRESSED',
        403,
        suppression.matchedSuppression
      )
    }

    const consentCheck = await evaluateDestinationConsent({
      supabase,
      ownerUserId: user.id,
      channel: 'email',
      destination: normalizedRecipient,
      propertyId: propertyId || null,
    })

    if (!consentCheck.allowed) {
      const consentMessage =
        consentCheck.reason === 'denied'
          ? 'Destination consent is denied for email.'
          : consentCheck.reason === 'unavailable'
          ? 'Unable to verify email consent right now.'
          : 'Destination consent is required for email.'

      return apiError(
        consentMessage,
        consentCheck.reason === 'denied'
          ? 'CONSENT_DENIED'
          : consentCheck.reason === 'unavailable'
          ? 'CONSENT_LOOKUP_UNAVAILABLE'
          : 'MISSING_CONSENT',
        403
      )
    }

    const result = await sendEmailFrom(senderName, {
      to: normalizedRecipient,
      subject: emailSubject,
      html: emailHtml,
      ...(agentEmail && { replyTo: agentEmail }),
    })

    if (!result.success) {
      console.error('Resend error:', result.error)
      // Surface the actual Resend error message so the user knows what went wrong
      const resendMsg =
        typeof result.error === 'object' && result.error !== null && 'message' in result.error
          ? String((result.error as { message: unknown }).message)
          : typeof result.error === 'string'
          ? result.error
          : 'Email service unavailable. Check your Resend API key and domain configuration.'
      return apiError(resendMsg, 'EXTERNAL_API_ERROR', 502, result.error)
    }

    const logResult = await recordOutboundEmailCommunication({
      userId: user.id,
      propertyId: propertyId || null,
      to: normalizedRecipient,
      subject: emailSubject,
      content: emailHtml,
      status: normalizeEmailProviderStatus('sent'),
      supabase,
    })

    if (!logResult.success) {
      console.warn('Failed to log outbound email communication:', logResult.error)
    }

    return apiSuccess({ sent: true, to: normalizedRecipient, subject: emailSubject })
  } catch (error) {
    console.error('Send email error:', error)
    return Errors.internal()
  }
})
