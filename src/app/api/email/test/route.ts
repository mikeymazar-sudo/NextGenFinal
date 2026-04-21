import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, notificationTemplate } from '@/lib/email'
import { normalizeEmailAddress } from '@/lib/marketing/communications'

/**
 * Test email endpoint
 * Usage: POST /api/email/test with body: { to: "test@example.com" }
 *
 * This endpoint is useful for:
 * - Verifying Resend API key configuration
 * - Testing email delivery
 * - Checking domain setup
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { to } = body

    if (!to || typeof to !== 'string') {
      return NextResponse.json(
        { error: 'Email address (to) is required' },
        { status: 400 }
      )
    }

    const normalizedTo = normalizeEmailAddress(to)

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!normalizedTo || !emailRegex.test(normalizedTo)) {
      return NextResponse.json(
        { error: 'Invalid email address format' },
        { status: 400 }
      )
    }

    // Check if API key is configured
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        {
          error: 'RESEND_API_KEY not configured',
          details: 'Please add RESEND_API_KEY to your .env.local file',
        },
        { status: 500 }
      )
    }

    // Create test email
    const { subject, html } = notificationTemplate(
      'Test Email - Resend Setup Successful! 🎉',
      `Congratulations! Your Resend email integration is working correctly. This is a test email sent at ${new Date().toLocaleString()}.`,
      'Learn More About Resend',
      'https://resend.com/docs'
    )

    // Send test email
    const result = await sendEmail({
      to: normalizedTo,
      subject,
      html,
      tags: [
        { name: 'category', value: 'test' },
        { name: 'environment', value: process.env.NODE_ENV || 'development' },
      ],
    })

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Failed to send email',
          details: result.error,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Test email sent successfully',
      emailId: result.data?.id,
      to: normalizedTo,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Test email error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint returns information about email configuration
 */
export async function GET() {
  const isConfigured = !!process.env.RESEND_API_KEY
  const domain = process.env.RESEND_DOMAIN || 'onboarding.resend.dev'

  return NextResponse.json({
    configured: isConfigured,
    domain,
    status: isConfigured ? 'ready' : 'not_configured',
    message: isConfigured
      ? 'Resend is configured and ready to send emails'
      : 'RESEND_API_KEY is not configured. Add it to .env.local to enable email functionality.',
  })
}
