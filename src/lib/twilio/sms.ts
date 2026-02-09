import twilio from 'twilio';
import { createServerClient as createClient } from '@/lib/supabase/server';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !phoneNumber) {
  throw new Error('Missing Twilio credentials in environment variables');
}

const client = twilio(accountSid, authToken);

export interface SendSMSParams {
  to: string;
  body: string;
  contactId?: string;
  propertyId?: string;
  mediaUrls?: string[];
}

export interface SMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  messageId?: string;
}

/**
 * Send an SMS message via Twilio and store it in the database
 */
export async function sendSMS(params: SendSMSParams): Promise<SMSResult> {
  const { to, body, contactId, propertyId, mediaUrls } = params;

  try {
    // Validate phone number format
    if (!to.startsWith('+')) {
      throw new Error('Phone number must be in E.164 format (e.g., +1234567890)');
    }

    // Send SMS via Twilio
    const message = await client.messages.create({
      body,
      from: phoneNumber,
      to,
      ...(mediaUrls && mediaUrls.length > 0 ? { mediaUrl: mediaUrls } : {})
    });

    // Store message in database
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('messages')
      .insert({
        body,
        direction: 'outbound',
        status: message.status,
        from_number: phoneNumber,
        to_number: to,
        twilio_sid: message.sid,
        twilio_status: message.status,
        contact_id: contactId || null,
        property_id: propertyId || null,
        media_urls: mediaUrls || null,
        num_segments: message.numSegments ? parseInt(message.numSegments) : 1,
        price: message.price ? parseFloat(message.price) : null,
        price_unit: message.priceUnit || 'USD'
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing message in database:', error);
      // Still return success since Twilio sent the message
      return {
        success: true,
        messageSid: message.sid,
        error: `Message sent but not stored: ${error.message}`
      };
    }

    return {
      success: true,
      messageSid: message.sid,
      messageId: data.id
    };

  } catch (error: any) {
    console.error('Error sending SMS:', error);

    // Store failed message in database
    try {
      const supabase = await createClient();
      await supabase
        .from('messages')
        .insert({
          body,
          direction: 'outbound',
          status: 'failed',
          from_number: phoneNumber,
          to_number: to,
          error_code: error.code?.toString() || null,
          error_message: error.message || 'Unknown error',
          contact_id: contactId || null,
          property_id: propertyId || null,
          media_urls: mediaUrls || null
        });
    } catch (dbError) {
      console.error('Error storing failed message:', dbError);
    }

    return {
      success: false,
      error: error.message || 'Failed to send SMS'
    };
  }
}

/**
 * Get conversation history for a contact
 */
export async function getConversation(contactPhone: string, limit: number = 50) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`from_number.eq.${contactPhone},to_number.eq.${contactPhone}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  return data;
}

/**
 * Get recent messages
 */
export async function getRecentMessages(limit: number = 50) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      contact:contacts(id, name, email),
      property:properties(id, address, city, state)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch recent messages: ${error.message}`);
  }

  return data;
}

/**
 * Update message status from Twilio webhook
 */
export async function updateMessageStatus(
  twilioSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('messages')
    .update({
      status,
      twilio_status: status,
      error_code: errorCode || null,
      error_message: errorMessage || null
    })
    .eq('twilio_sid', twilioSid);

  if (error) {
    throw new Error(`Failed to update message status: ${error.message}`);
  }
}
