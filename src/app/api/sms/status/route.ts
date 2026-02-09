import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { updateMessageStatus } from '@/lib/twilio/sms';

const authToken = process.env.TWILIO_AUTH_TOKEN;

export async function POST(request: NextRequest) {
  try {
    // Get the Twilio signature for validation
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = request.url;

    // Parse form data from Twilio webhook
    const formData = await request.formData();
    const params: Record<string, any> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });

    // Validate webhook authenticity
    if (authToken) {
      const isValid = twilio.validateRequest(
        authToken,
        signature,
        url,
        params
      );

      if (!isValid) {
        console.error('Invalid Twilio signature');
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    // Extract status details
    const {
      MessageSid,
      MessageStatus,
      ErrorCode,
      ErrorMessage
    } = params;

    // Update message status in database
    await updateMessageStatus(
      MessageSid,
      MessageStatus,
      ErrorCode,
      ErrorMessage
    );

    return new NextResponse('OK', { status: 200 });

  } catch (error: any) {
    console.error('Error in SMS status webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
