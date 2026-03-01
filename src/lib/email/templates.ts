/**
 * Email template utilities for NextGen Realty
 * These templates use inline CSS for better email client compatibility.
 * Design goal: clean, personal emails — no marketing banners or branded headers.
 */

// Base email layout — minimal white background, no header/footer branding
export function baseEmailTemplate(content: string, senderName?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px;">
          <tr>
            <td style="padding: 40px 24px 24px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 40px;">
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 12px;">
              ${senderName ? `<p style="margin: 0; color: #9ca3af; font-size: 12px; font-family: Arial, sans-serif;">${senderName} &middot; NextGen Realty</p>` : ''}
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

    ${property.imageUrl ? `<img src="${property.imageUrl}" alt="${property.address}" style="width: 100%; max-width: 552px; height: auto; border-radius: 6px; margin-bottom: 20px;">` : ''}

    <h2 style="margin: 0 0 20px; color: #111827; font-size: 22px; font-weight: 600;">
      ${property.address}
    </h2>

    <div style="background-color: #f9fafb; padding: 18px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 6px 0;">
            <strong style="color: #374151;">Address:</strong>
            <span style="color: #6b7280; margin-left: 8px;">${fullAddress}</span>
          </td>
        </tr>
        ${property.price ? `<tr><td style="padding: 6px 0;"><strong style="color: #374151;">Price:</strong> <span style="color: #059669; font-size: 17px; font-weight: 600; margin-left: 8px;">$${property.price.toLocaleString()}</span></td></tr>` : ''}
        ${property.bedrooms || property.bathrooms ? `<tr><td style="padding: 6px 0;"><strong style="color: #374151;">Beds / Baths:</strong> <span style="color: #6b7280; margin-left: 8px;">${property.bedrooms || '?'} bed / ${property.bathrooms || '?'} bath</span></td></tr>` : ''}
        ${property.sqft ? `<tr><td style="padding: 6px 0;"><strong style="color: #374151;">Square Feet:</strong> <span style="color: #6b7280; margin-left: 8px;">${property.sqft.toLocaleString()} sqft</span></td></tr>` : ''}
      </table>
    </div>

    ${property.description ? `<p style="margin: 0 0 20px; color: #4b5563; font-size: 15px; line-height: 1.6;">${property.description}</p>` : ''}

    ${property.propertyUrl ? `<a href="${property.propertyUrl}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: 600; font-size: 14px; margin: 10px 0 20px;">View Property Details</a>` : ''}

    <p style="margin: 24px 0 0; color: #374151; font-size: 15px; line-height: 1.6;">
      Best regards,<br>
      <strong style="color: #111827;">${senderName}</strong>
    </p>
  `

  return {
    subject: `Property Details: ${property.address}`,
    html: baseEmailTemplate(content, senderName),
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

    <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.7;">
      I wanted to follow up regarding the property at <strong>${propertyAddress}</strong>.
    </p>

    <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.7;">
      ${message}
    </p>

    <p style="margin: 0 0 24px; color: #374151; font-size: 15px; line-height: 1.7;">
      Feel free to reply to this email or give me a call — happy to chat whenever works for you.
    </p>

    <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6;">
      Best regards,<br>
      <strong style="color: #111827;">${senderName}</strong>
    </p>
  `

  return {
    subject: `Following Up - ${propertyAddress}`,
    html: baseEmailTemplate(content, senderName),
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

    <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.7;">
      I'm pleased to present a cash offer for the property at <strong>${property.address}</strong>.
    </p>

    <div style="background-color: #f0fdf4; padding: 20px 24px; border-radius: 6px; margin: 20px 0; border: 1px solid #bbf7d0;">
      <p style="margin: 0 0 4px; color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Cash Offer</p>
      <p style="margin: 0; color: #15803d; font-size: 30px; font-weight: 700;">$${offerAmount.toLocaleString()}</p>
    </div>

    ${additionalNotes ? `<p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.7;">${additionalNotes}</p>` : ''}

    <p style="margin: 0 0 24px; color: #374151; font-size: 15px; line-height: 1.7;">
      Please review and let me know if you have any questions — I'm happy to discuss the details at your convenience.
    </p>

    <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6;">
      Best regards,<br>
      <strong style="color: #111827;">${senderName}</strong>
    </p>
  `

  return {
    subject: `Offer Presented - ${property.address}`,
    html: baseEmailTemplate(content, senderName),
  }
}

// Welcome/onboarding email template
export function welcomeTemplate(
  recipientName: string,
  agentName: string
): { subject: string; html: string } {
  const content = `
    <p style="margin: 0 0 20px; color: #111827; font-size: 16px; line-height: 1.5;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.7;">
      Thank you for reaching out. I'm <strong>${agentName}</strong> with NextGen Realty, and I'm looking forward to working with you.
    </p>

    <div style="background-color: #f9fafb; padding: 18px; border-radius: 6px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <p style="margin: 0 0 10px; color: #111827; font-size: 15px; font-weight: 600;">What to expect:</p>
      <ul style="margin: 0; padding-left: 18px; color: #4b5563; font-size: 15px; line-height: 1.8;">
        <li>An initial consultation to understand your situation</li>
        <li>A fair, no-obligation offer on your property</li>
        <li>Regular updates throughout the process</li>
        <li>Quick, straightforward closing on your timeline</li>
      </ul>
    </div>

    <p style="margin: 0 0 24px; color: #374151; font-size: 15px; line-height: 1.7;">
      Feel free to reply or call anytime — I'm here to help.
    </p>

    <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6;">
      Best regards,<br>
      <strong style="color: #111827;">${agentName}</strong>
    </p>
  `

  return {
    subject: 'Welcome to NextGen Realty!',
    html: baseEmailTemplate(content, agentName),
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
    <h2 style="margin: 0 0 16px; color: #111827; font-size: 20px; font-weight: 600;">
      ${title}
    </h2>

    <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.7;">
      ${message}
    </p>

    ${ctaText && ctaUrl ? `<a href="${ctaUrl}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: 600; font-size: 14px; margin: 4px 0 20px;">${ctaText}</a>` : ''}

    <p style="margin: 20px 0 0; color: #374151; font-size: 15px; line-height: 1.6;">
      Best regards,<br>
      <strong style="color: #111827;">NextGen Realty</strong>
    </p>
  `

  return {
    subject: title,
    html: baseEmailTemplate(content),
  }
}
