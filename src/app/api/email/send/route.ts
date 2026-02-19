import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Resend } from 'resend'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY)
}

const SendEmailSchema = z.object({
  to: z.string().email(),
  template: z.enum(['property_details', 'follow_up', 'offer_sent', 'custom']),
  propertyId: z.string().uuid().optional(),
  subject: z.string().optional(),
  customHtml: z.string().optional(),
})

function renderTemplate(
  template: string,
  property: Record<string, unknown> | null,
  senderName: string
): { subject: string; html: string } {
  switch (template) {
    case 'property_details':
      return {
        subject: `Property Details: ${property?.address || 'Inquiry'}`,
        html: `
          <h2>Property Details</h2>
          <p><strong>Address:</strong> ${property?.address || 'N/A'}, ${property?.city || ''} ${property?.state || ''} ${property?.zip || ''}</p>
          <p><strong>Price:</strong> ${property?.list_price ? `$${Number(property.list_price).toLocaleString()}` : 'Contact for pricing'}</p>
          <p><strong>Beds/Baths:</strong> ${property?.bedrooms || '?'} / ${property?.bathrooms || '?'}</p>
          <p><strong>Sqft:</strong> ${property?.sqft ? Number(property.sqft).toLocaleString() : 'N/A'}</p>
          <p>Best regards,<br/>${senderName}</p>
        `,
      }
    case 'follow_up':
      return {
        subject: `Following Up - ${property?.address || 'Property Inquiry'}`,
        html: `
          <p>Hi,</p>
          <p>I wanted to follow up regarding the property at <strong>${property?.address || 'the address we discussed'}</strong>.</p>
          <p>Are you still interested in discussing options? I'd love to chat when you have a moment.</p>
          <p>Best regards,<br/>${senderName}</p>
        `,
      }
    case 'offer_sent':
      return {
        subject: `Offer for ${property?.address || 'Property'}`,
        html: `
          <p>Hi,</p>
          <p>Thank you for considering our offer on the property at <strong>${property?.address || 'the address'}</strong>.</p>
          <p>Please review the details and let me know if you have any questions.</p>
          <p>Best regards,<br/>${senderName}</p>
        `,
      }
    default:
      return { subject: 'Message from NextGen Realty', html: '' }
  }
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = SendEmailSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid input. Provide to, template, and optionally propertyId.')
    }

    const { to, template, propertyId, subject: customSubject, customHtml } = parsed.data

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

    if (template === 'custom' && customHtml) {
      emailSubject = customSubject || 'Message from NextGen Realty'
      emailHtml = customHtml
    } else {
      const rendered = renderTemplate(template, property, senderName)
      emailSubject = customSubject || rendered.subject
      emailHtml = rendered.html
    }

    const domain = process.env.RESEND_DOMAIN || 'nextgenrealty.com'

    const { error: sendError } = await getResendClient().emails.send({
      from: `${senderName} <noreply@${domain}>`,
      to,
      subject: emailSubject,
      html: emailHtml,
    })

    if (sendError) {
      console.error('Resend error:', sendError)
      return Errors.externalApi('Email service', sendError)
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
