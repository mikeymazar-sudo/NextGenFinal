# NextGen Realty SMS Integration Guide

## ✅ Completed Setup

### 1. A2P 10DLC Campaign Registration
- **Status**: ✅ Submitted and under review
- **Campaign SID**: CM75c50928042ee7520...
- **Status**: In progress (awaiting carrier approval)
- **Timeline**: 1-5 business days for approval
- **Phone Number**: +19547686883

### 2. Database Schema
- **File**: `supabase/migrations/20260208_create_messages_table.sql`
- Created `messages` table with:
  - Message content (body, direction, status)
  - Phone numbers (from/to)
  - Twilio details (SID, status, error tracking)
  - Relationships to contacts and properties
  - Media support for MMS
  - Pricing and billing data
  - Row Level Security enabled
  - Indexes for optimal performance

### 3. Backend Services

#### Twilio SMS Service (`src/lib/twilio/sms.ts`)
- `sendSMS()` - Send outbound SMS with database storage
- `getConversation()` - Get message history for a contact
- `getRecentMessages()` - Get all recent messages
- `updateMessageStatus()` - Update message status from webhooks

#### API Routes

**Send SMS** - `POST /api/sms/send`
```typescript
// Request
{
  to: "+12345678900",
  message: "Your appointment is confirmed!",
  contactId?: "uuid",
  propertyId?: "uuid",
  mediaUrls?: ["https://..."]
}

// Response
{
  success: true,
  messageSid: "SM...",
  messageId: "uuid"
}
```

**Receive SMS** - `POST /api/sms/webhook`
- Handles incoming messages from Twilio
- Validates Twilio signature
- Stores messages in database
- Auto-links to contacts by phone number
- Returns TwiML response

**Get Conversations** - `GET /api/sms/conversations`
```typescript
// Get specific conversation
GET /api/sms/conversations?phone=+12345678900&limit=50

// Get all recent messages
GET /api/sms/conversations?limit=100
```

**Status Updates** - `POST /api/sms/status`
- Handles delivery status updates from Twilio
- Updates message status (sent, delivered, failed, etc.)

## 🔧 Next Steps

### Step 1: Apply Database Migration
```bash
# If using Supabase CLI
supabase db push

# Or run the SQL file directly in Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Copy contents of supabase/migrations/20260208_create_messages_table.sql
# 3. Execute the query
```

### Step 2: Configure Twilio Webhooks (After Campaign Approval)
Once your A2P 10DLC campaign is approved:

1. **Go to Twilio Console**:
   - Navigate to Phone Numbers → Active Numbers
   - Select your number (+19547686883)

2. **Configure Messaging Webhooks**:
   - **A MESSAGE COMES IN**: `https://yourdomain.com/api/sms/webhook` (HTTP POST)
   - **STATUS CALLBACK URL**: `https://yourdomain.com/api/sms/status` (HTTP POST)

3. **Deploy Your App First**:
   ```bash
   # Make sure your app is deployed and accessible
   npm run build
   npm run start
   # Or deploy to Vercel/production
   ```

### Step 3: Test SMS Integration

**Test Sending SMS**:
```typescript
// Using fetch from your frontend
const response = await fetch('/api/sms/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '+12345678900',
    message: 'Test message from NextGen Realty',
    contactId: 'contact-uuid' // optional
  })
});

const result = await response.json();
console.log(result);
```

**Test Receiving SMS**:
- Send a text message to +19547686883
- Check your database `messages` table
- Should see new row with direction='inbound'

### Step 4: Create Frontend Components

Example React component for SMS:

```typescript
// components/SMSComposer.tsx
'use client';
import { useState } from 'react';

export function SMSComposer({
  contactId,
  contactPhone
}: {
  contactId: string;
  contactPhone: string;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sendSMS = async () => {
    setSending(true);
    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contactPhone,
          message,
          contactId
        })
      });

      if (response.ok) {
        setMessage('');
        alert('Message sent!');
      } else {
        alert('Failed to send message');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message..."
        className="w-full p-3 border rounded-lg"
        rows={4}
      />
      <button
        onClick={sendSMS}
        disabled={!message || sending}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
      >
        {sending ? 'Sending...' : 'Send SMS'}
      </button>
    </div>
  );
}
```

### Step 5: Add SMS to Property/Contact Pages

Integrate SMS functionality into your existing property and contact views:

1. **Property Page**: Add SMS button to send property updates
2. **Contact Page**: Add conversation view and SMS composer
3. **Dashboard**: Show recent SMS activity

### Step 6: Implement Message Templates

Create reusable SMS templates:

```typescript
// lib/sms-templates.ts
export const templates = {
  appointmentConfirmation: (name: string, address: string, date: string, time: string) =>
    `Hi ${name}, your property showing at ${address} is confirmed for ${date} at ${time}. Reply STOP to unsubscribe. - NextGen Realty`,

  propertyAlert: (propertyType: string, neighborhood: string, price: string, beds: string, baths: string) =>
    `New listing alert! ${propertyType} in ${neighborhood} just listed at $${price}. ${beds}bd/${baths}ba. Text STOP to opt out. - NextGen Realty`,

  openHouse: (day: string, address: string, startTime: string, endTime: string, agentPhone: string) =>
    `Open House this ${day} at ${address} from ${startTime}-${endTime}. Call ${agentPhone} with questions. Reply STOP to unsubscribe. - NextGen Realty`
};
```

## 📊 Monitoring & Analytics

### View Messages in Database
```sql
-- Recent messages
SELECT * FROM messages ORDER BY created_at DESC LIMIT 50;

-- Failed messages
SELECT * FROM messages WHERE status = 'failed';

-- Conversation with specific contact
SELECT * FROM messages
WHERE from_number = '+12345678900' OR to_number = '+12345678900'
ORDER BY created_at DESC;

-- Message statistics
SELECT
  direction,
  status,
  COUNT(*) as count
FROM messages
GROUP BY direction, status;
```

### Twilio Console
- Monitor usage and costs
- View delivery reports
- Check campaign status

## 🔒 Security Notes

1. **Webhook Validation**: All webhooks validate Twilio signatures
2. **Rate Limiting**: Consider adding rate limiting to send endpoint
3. **Phone Number Validation**: E.164 format required
4. **RLS**: Row Level Security enabled on messages table
5. **Environment Variables**: Keep Twilio credentials secure

## 💰 Costs

- **A2P 10DLC Campaign**: $2.00/month (Sole Proprietor)
- **SMS Messages**: ~$0.0079 per segment (US)
- **MMS Messages**: ~$0.02 per message
- **Phone Number**: ~$1.15/month

## 📝 Campaign Status

Current campaign is **under review**. While waiting:
- ✅ Database is ready
- ✅ API endpoints are ready
- ✅ Service layer is complete
- ⏳ Webhook configuration (do after approval)
- ⏳ Frontend components (optional)

Once approved, SMS will work immediately! You'll receive an email from Twilio when the campaign is approved.

## 🆘 Troubleshooting

### Messages Not Sending
1. Check campaign status in Twilio Console
2. Verify environment variables are set
3. Check Twilio account balance
4. Review error logs in database

### Webhooks Not Working
1. Verify webhook URLs are publicly accessible
2. Check Twilio signature validation
3. Review webhook logs in Twilio Console
4. Test with Twilio's webhook debugger

### Contact Linking Issues
1. Ensure contact phone numbers are in E.164 format
2. Check contact exists in database
3. Verify contact_id is being passed correctly

## 🎯 Best Practices

1. **Always include opt-out instructions** (STOP)
2. **Use message templates** for consistency
3. **Log all messages** to database
4. **Monitor delivery rates** in Twilio
5. **Respect quiet hours** (don't send late at night)
6. **Keep messages concise** (<160 chars to avoid segmentation)
7. **Include sender name** ("- NextGen Realty")
8. **Link messages to contacts** for conversation history

## 🚀 Future Enhancements

- [ ] Automated appointment reminders
- [ ] Property update broadcasts
- [ ] AI-powered response suggestions
- [ ] SMS scheduling
- [ ] Bulk messaging campaigns
- [ ] SMS analytics dashboard
- [ ] Two-way conversation UI
- [ ] Message templates library
- [ ] Contact preferences (SMS opt-in/out per contact)
