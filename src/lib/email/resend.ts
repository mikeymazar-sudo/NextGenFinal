import { Resend } from 'resend'

// Initialize Resend client
export const resend = new Resend(process.env.RESEND_API_KEY)

// Email configuration
export const EMAIL_CONFIG = {
  domain: process.env.RESEND_DOMAIN || 'onboarding.resend.dev',
  from: {
    name: 'NextGen Realty',
    default: `NextGen Realty <noreply@${process.env.RESEND_DOMAIN || 'onboarding.resend.dev'}>`,
  },
}

// Email types
export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
  tags?: Array<{ name: string; value: string }>
}

/**
 * Send an email using Resend
 * @param options - Email options
 * @returns Result with email ID or error
 */
export async function sendEmail(options: SendEmailOptions) {
  try {
    const { data, error } = await resend.emails.send({
      from: options.from || EMAIL_CONFIG.from.default,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.replyTo && { replyTo: options.replyTo }),
      ...(options.cc && { cc: options.cc }),
      ...(options.bcc && { bcc: options.bcc }),
      ...(options.tags && { tags: options.tags }),
    })

    if (error) {
      console.error('Resend error:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Email send error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Send email with custom sender name
 */
export async function sendEmailFrom(
  senderName: string,
  options: Omit<SendEmailOptions, 'from'>
) {
  return sendEmail({
    ...options,
    from: `${senderName} <noreply@${EMAIL_CONFIG.domain}>`,
  })
}

/**
 * Send bulk emails (useful for newsletters, announcements)
 */
export async function sendBulkEmails(
  recipients: string[],
  subject: string,
  html: string,
  options?: Partial<SendEmailOptions>
) {
  const results = []

  // Send in batches to avoid rate limits
  const batchSize = 50
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize)
    const promises = batch.map((to) =>
      sendEmail({
        to,
        subject,
        html,
        ...options,
      })
    )
    const batchResults = await Promise.allSettled(promises)
    results.push(...batchResults)
  }

  return results
}
