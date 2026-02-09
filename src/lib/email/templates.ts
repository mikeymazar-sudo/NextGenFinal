/**
 * Email template utilities for NextGen Realty
 * These templates use inline CSS for better email client compatibility
 */

// Base email layout with professional styling
export function baseEmailTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NextGen Realty</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">NextGen Realty</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; text-align: center; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">
                © ${new Date().getFullYear()} NextGen Realty. All rights reserved.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                This email was sent by NextGen Realty
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

// Property details email template
export interface PropertyDetailsData {
  address: string
  city?: string
  state?: string
  zip?: string
  price?: number
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  description?: string
  imageUrl?: string
  propertyUrl?: string
}

export function propertyDetailsTemplate(
  property: PropertyDetailsData,
  senderName: string
): { subject: string; html: string } {
  const fullAddress = [
    property.address,
    property.city,
    property.state,
    property.zip,
  ]
    .filter(Boolean)
    .join(', ')

  const content = `
    <p style="margin: 0 0 20px; color: #111827; font-size: 16px; line-height: 1.5;">
      Hello,
    </p>

    ${property.imageUrl ? `<img src="${property.imageUrl}" alt="${property.address}" style="width: 100%; max-width: 600px; height: auto; border-radius: 8px; margin-bottom: 20px;">` : ''}

    <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">
      ${property.address}
    </h2>

    <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 8px 0;">
            <strong style="color: #374151;">Address:</strong>
            <span style="color: #6b7280;">${fullAddress}</span>
          </td>
        </tr>
        ${property.price ? `<tr><td style="padding: 8px 0;"><strong style="color: #374151;">Price:</strong> <span style="color: #059669; font-size: 18px; font-weight: 600;">$${property.price.toLocaleString()}</span></td></tr>` : ''}
        ${property.bedrooms || property.bathrooms ? `<tr><td style="padding: 8px 0;"><strong style="color: #374151;">Beds/Baths:</strong> <span style="color: #6b7280;">${property.bedrooms || '?'} bed / ${property.bathrooms || '?'} bath</span></td></tr>` : ''}
        ${property.sqft ? `<tr><td style="padding: 8px 0;"><strong style="color: #374151;">Square Feet:</strong> <span style="color: #6b7280;">${property.sqft.toLocaleString()} sqft</span></td></tr>` : ''}
      </table>
    </div>

    ${property.description ? `<p style="margin: 0 0 20px; color: #4b5563; font-size: 15px; line-height: 1.6;">${property.description}</p>` : ''}

    ${property.propertyUrl ? `<a href="${property.propertyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 0 20px;">View Property Details</a>` : ''}

    <p style="margin: 20px 0 0; color: #6b7280; font-size: 15px; line-height: 1.5;">
      Best regards,<br>
      <strong style="color: #111827;">${senderName}</strong><br>
      <span style="color: #9ca3af;">NextGen Realty</span>
    </p>
  `

  return {
    subject: `Property Details: ${property.address}`,
    html: baseEmailTemplate(content),
  }
}

// Follow-up email template
export function followUpTemplate(
  propertyAddress: string,
  recipientName: string | null,
  message: string,
  senderName: string
): { subject: string; html: string } {
  const content = `
    <p style="margin: 0 0 20px; color: #111827; font-size: 16px; line-height: 1.5;">
      ${recipientName ? `Hi ${recipientName},` : 'Hello,'}
    </p>

    <p style="margin: 0 0 20px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      I wanted to follow up regarding the property at <strong style="color: #111827;">${propertyAddress}</strong>.
    </p>

    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; color: #1e3a8a; font-size: 15px; line-height: 1.6;">
        ${message}
      </p>
    </div>

    <p style="margin: 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      I'd love to discuss this further when you have a moment. Feel free to reply to this email or give me a call.
    </p>

    <p style="margin: 20px 0 0; color: #6b7280; font-size: 15px; line-height: 1.5;">
      Best regards,<br>
      <strong style="color: #111827;">${senderName}</strong><br>
      <span style="color: #9ca3af;">NextGen Realty</span>
    </p>
  `

  return {
    subject: `Following Up - ${propertyAddress}`,
    html: baseEmailTemplate(content),
  }
}

// Offer email template
export function offerTemplate(
  property: PropertyDetailsData,
  offerAmount: number,
  recipientName: string | null,
  senderName: string,
  additionalNotes?: string
): { subject: string; html: string } {
  const content = `
    <p style="margin: 0 0 20px; color: #111827; font-size: 16px; line-height: 1.5;">
      ${recipientName ? `Hi ${recipientName},` : 'Hello,'}
    </p>

    <p style="margin: 0 0 20px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      I'm pleased to present an offer for the property at <strong style="color: #111827;">${property.address}</strong>.
    </p>

    <div style="background-color: #f0fdf4; padding: 24px; border-radius: 8px; margin: 20px 0; border: 2px solid #10b981;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 8px 0;">
            <strong style="color: #065f46; font-size: 14px;">OFFER AMOUNT</strong>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #059669; font-size: 32px; font-weight: 700;">$${offerAmount.toLocaleString()}</span>
          </td>
        </tr>
      </table>
    </div>

    ${additionalNotes ? `<p style="margin: 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">${additionalNotes}</p>` : ''}

    <p style="margin: 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Please review the offer details and let me know if you have any questions. I'm happy to discuss this further at your convenience.
    </p>

    <p style="margin: 20px 0 0; color: #6b7280; font-size: 15px; line-height: 1.5;">
      Best regards,<br>
      <strong style="color: #111827;">${senderName}</strong><br>
      <span style="color: #9ca3af;">NextGen Realty</span>
    </p>
  `

  return {
    subject: `Offer Presented - ${property.address}`,
    html: baseEmailTemplate(content),
  }
}

// Welcome/onboarding email template
export function welcomeTemplate(
  recipientName: string,
  agentName: string
): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">
      Welcome to NextGen Realty!
    </h2>

    <p style="margin: 0 0 20px; color: #111827; font-size: 16px; line-height: 1.5;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Thank you for choosing NextGen Realty. I'm <strong>${agentName}</strong>, and I'm excited to help you with your real estate journey.
    </p>

    <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px; color: #111827; font-size: 18px; font-weight: 600;">What's Next?</h3>
      <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
        <li>We'll schedule an initial consultation to understand your needs</li>
        <li>I'll start searching for properties that match your criteria</li>
        <li>You'll receive regular updates on new listings and market insights</li>
        <li>I'm here to answer any questions you have along the way</li>
      </ul>
    </div>

    <p style="margin: 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Feel free to reach out anytime. I'm looking forward to working with you!
    </p>

    <p style="margin: 20px 0 0; color: #6b7280; font-size: 15px; line-height: 1.5;">
      Best regards,<br>
      <strong style="color: #111827;">${agentName}</strong><br>
      <span style="color: #9ca3af;">NextGen Realty</span>
    </p>
  `

  return {
    subject: 'Welcome to NextGen Realty!',
    html: baseEmailTemplate(content),
  }
}

// Generic notification template
export function notificationTemplate(
  title: string,
  message: string,
  ctaText?: string,
  ctaUrl?: string
): { subject: string; html: string } {
  const content = `
    <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">
      ${title}
    </h2>

    <p style="margin: 0 0 20px; color: #4b5563; font-size: 15px; line-height: 1.6;">
      ${message}
    </p>

    ${ctaText && ctaUrl ? `<a href="${ctaUrl}" style="display: inline-block; padding: 12px 24px; background-color: #667eea; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 0 20px;">${ctaText}</a>` : ''}

    <p style="margin: 20px 0 0; color: #6b7280; font-size: 15px; line-height: 1.5;">
      Best regards,<br>
      <strong style="color: #111827;">The NextGen Realty Team</strong>
    </p>
  `

  return {
    subject: title,
    html: baseEmailTemplate(content),
  }
}
