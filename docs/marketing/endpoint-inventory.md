# Endpoint Inventory

## Current routes to normalize

### SMS

`POST /api/sms/send`

- current request: `{ to, message, contactId?, propertyId?, mediaUrls? }`
- current response: `{ data: { success, messageSid?, messageId?, phoneNumber } }`
- current gaps: no ownership verification for `contactId` or `propertyId`; no suppression or consent gate

`GET /api/sms/conversations`

- current request: `phone?`, `limit?`
- current response: `{ data: { messages } }`
- current gaps: inbox model is message-list only; no thread contract

`POST /api/sms/webhook`

- current role: inbound SMS ingestion
- target contract: create communication event, update thread, parse STOP and START semantics, map to suppression table

`POST /api/sms/status`

- current role: delivery status webhook
- target contract: map provider status to normalized status and update thread analytics counters

### Email

`POST /api/email/send`

- current request: `{ to, template, propertyId?, subject?, customHtml?, replyTo?, message?, offerAmount? }`
- current response: `{ data: { sent, to, subject } }`
- current gaps: no ownership verification for `propertyId`; no suppression or unsubscribe gate; logs only when `propertyId` exists

`GET|POST /api/email/test`

- current role: test utility
- target contract: keep outside marketing launch path and protect or retire before launch

### Voice

`GET /api/voice/token`

- current role: dialer token provisioning
- target contract: continue supporting dialer; marketing voice runner consumes shared ownership and phone-number eligibility helpers

`POST /api/voice/outbound`

- current role: public TwiML dial endpoint
- target contract: separate dialer live-call behavior from marketing voicemail behavior

`GET /api/voice/calls`

- current request: `propertyId`
- current response: `{ data: calls }`
- current gaps: no property ownership check

`PATCH /api/voice/calls/[id]`

- current request: `{ notes?, propertyId? }`
- current response: `{ data: updatedCall }`
- current gaps: caller can reassign `propertyId` without verifying property ownership

`POST /api/voice/webhook`

- current role: call status ingestion
- target contract: capture voicemail outcomes, recording URLs, transcript state, and normalized status mapping

### Activity and contacts

`GET /api/activity`

- current request: `propertyId`
- current response: timeline union of notes, communication logs, activity log, and calls
- current gaps: no property ownership validation; SMS messages absent from the timeline

`GET|POST /api/contacts`

- current gaps: `GET` verifies property ownership; `POST` does not

`PATCH|DELETE /api/contacts/[id]`

- current gaps: no ownership verification on the contact itself

### Imports

`POST /api/properties/import`

- current request: `{ properties, listName? }`
- current response: `{ data: { imported, skipped, errors, listId, propertyIds } }`
- current gaps: creates property/list records but not explicit audience or enrollment records; uses `user_profiles` instead of normalized actor profile

## New route family

Add a marketing route family for the command center UI.

### `GET /api/marketing/command-center`

Returns the page bootstrap payload:

- campaigns summary
- audience/import summary
- inbox thread summary
- analytics summary
- review queue counts

### `GET|POST /api/marketing/campaigns`

`POST` request shape:

```json
{
  "name": "April nurture",
  "channel": "sms",
  "audienceSourceType": "lead_list",
  "audienceSourceId": "uuid",
  "draftPayload": {},
  "steps": []
}
```

`POST` response shape:

```json
{
  "data": {
    "campaign": {},
    "reviewState": "draft"
  }
}
```

### `GET|PATCH /api/marketing/campaigns/[id]`

- returns campaign detail, steps, enrollments summary, and review requirements

### `POST /api/marketing/campaigns/[id]/review`

- recomputes eligibility and suppression results
- returns step preview plus enrollment review summary

### `POST /api/marketing/campaigns/[id]/launch`

- requires `reviewState = approved`
- creates execution records
- returns launch summary with `queued`, `suppressed`, `failed`, and `skipped` counts

### `GET /api/marketing/inbox`

- returns normalized thread list with filters for `needs_reply`, `failed`, `review_required`, and `campaign_id`

### `GET /api/marketing/inbox/[threadId]`

- returns thread detail using the unified communication contract

### `GET /api/marketing/analytics`

- returns counts based on normalized communication status

## Shared contract rules

- Auth is required for every marketing route.
- Every route must verify campaign, property, contact, and phone-number ownership before read or write.
- Every outbound send or call action must run suppression and consent gates first.
- New routes use the standard `apiSuccess` and `apiError` response envelope.
- Webhook routes may return provider-specific formats, but internal updates must map into normalized status values.
