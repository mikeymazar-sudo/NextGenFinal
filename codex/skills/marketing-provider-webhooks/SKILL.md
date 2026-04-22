---
name: marketing-provider-webhooks
description: Use when implementing or updating SignalWire or Resend marketing webhooks, inbound reply threading, suppression normalization, provider event mapping, or workflow stop-rule handling.
---

# Marketing Provider Webhooks

Read these docs first:

- `docs/marketing/webhook-expectations.md`
- `docs/marketing/endpoint-inventory.md`
- `docs/marketing/channel-workflow-contract.md`
- `docs/marketing/source-of-truth-map.md`

## Webhook contract

- All webhook handlers must require provider verification or signature checks where supported.
- Process events idempotently using a provider event id, provider message id, or equivalent stable resource id.
- Update raw event storage, `communication_threads`, enrollment state, and workflow stop-rules together.
- Keep suppression rows normalized to the shared `active` and `resolved` status model.
- STOP, START, unsubscribe, complaints, and hard delivery failures must stop future automated steps immediately when the product contract requires it.

## Provider-specific rules

- Resend inbound replies should resolve through app-owned reply tokens tied to campaign, version, and contact-run context.
- Resend delivery, complaint, and suppression signals should map into shared inbox and suppression state instead of only channel-local logs.
- SignalWire voicemail flows should use AMD outcomes carefully and should not mark `voicemail_left` when a human answered.
- SMS inbound and status callbacks should update thread state and consent or suppression side effects idempotently.

## Before landing a change

- Note the idempotency key used for the handler.
- Note how the event is mapped into the shared communication status model.
- Note which rows are updated for thread state, suppression state, and workflow stop state.
- Confirm the handler cannot bypass shared ownership, consent, or suppression rules by writing only provider-local tables.
