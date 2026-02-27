import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiError, apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import {
  sendEmailFrom,
  EMAIL_CONFIG,
} from '@/lib/email/resend'
import {
  propertyDetailsTemplate,
  followUpTemplate,
  offerTemplate,
  baseEmailTemplate,
} from '@/lib/email/templates'

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
    const body = await req.json()
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
    const agentEmail = replyTo || profile?.email

    // Get property if provided
    let property: Record<string, unknown> | null = null
    if (propertyId) {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single()
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

    const result = await sendEmailFrom(senderName, {
      to,
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

    // Log to communication_logs
    if (propertyId) {
      await supabase.from('communication_logs').insert({
        property_id: propertyId,
        user_id: user.id,
        type: 'email',
        direction: 'outbound',
        subject: emailSubject,
        content: emailHtml,
        recipient: to,
        status: 'sent',
      })
    }

    return apiSuccess({ sent: true, to, subject: emailSubject })
  } catch (error) {
    console.error('Send email error:', error)
    return Errors.internal()
  }
})
