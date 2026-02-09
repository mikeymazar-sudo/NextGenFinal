import { NextRequest, NextResponse } from 'next/server';
import { sendSMS } from '@/lib/twilio/sms';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, message, contactId, propertyId, mediaUrls } = body;

    // Validate required fields
    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: to, message' },
        { status: 400 }
      );
    }

    // Validate phone number format
    if (!to.match(/^\+[1-9]\d{1,14}$/)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Must be in E.164 format (e.g., +12345678900)' },
        { status: 400 }
      );
    }

    // Send SMS
    const result = await sendSMS({
      to,
      body: message,
      contactId,
      propertyId,
      mediaUrls
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send SMS' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageSid: result.messageSid,
      messageId: result.messageId
    });

  } catch (error: any) {
    console.error('Error in SMS send API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
