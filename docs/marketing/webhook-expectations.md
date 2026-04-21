# Webhook Expectations

## Shared requirements

- Webhook signature validation is mandatory in environments that can receive production traffic.
- Missing signature configuration must fail closed for provider callbacks that mutate production data.
- All webhook handlers must be idempotent by provider event identifier or provider resource identifier.
- Webhook handlers may return provider-specific response bodies, but database writes must use normalized status mapping.

## SMS inbound

Source: `/api/sms/webhook`

Required behavior:

- normalize `from` and `to`
- resolve owned number assignment
- locate contact and property context when possible
- store inbound message event
- update or create communication thread
- parse opt-out and opt-in keywords
- create or resolve global suppression rows
- mark thread `needs_reply = true`

## SMS delivery status

Source: `/api/sms/status`

Required behavior:

- upsert by provider message id
- map provider states into normalized status values
- persist failure metadata
- update campaign enrollment delivery state when the message belongs to a campaign
- update thread summary counters and last status

## Voice and voicemail status

Source: `/api/voice/webhook`

Required behavior:

- upsert by provider call id
- capture `answered`, `completed`, `busy`, `failed`, recording URL, and transcript metadata
- distinguish live call outcomes from voicemail campaign outcomes
- map to normalized status values
- update campaign enrollment and communication thread summaries

## Email provider events

V1 launch does not block on full email webhook support, but the contract should support it.

If provider webhooks are added:

- accept delivered, bounced, complaint, unsubscribe, open, and reply-related events
- map deliverability events into normalized status values
- create global suppression rows for unsubscribe and complaint events
- keep non-delivery engagement events out of core delivery counts unless explicitly surfaced in analytics
