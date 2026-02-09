import { NextRequest, NextResponse } from 'next/server';
import { getConversation, getRecentMessages } from '@/lib/twilio/sms';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const contactPhone = searchParams.get('phone');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (contactPhone) {
      // Get conversation for a specific contact
      const messages = await getConversation(contactPhone, limit);
      return NextResponse.json({ messages });
    } else {
      // Get all recent messages
      const messages = await getRecentMessages(limit);
      return NextResponse.json({ messages });
    }

  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
