---
name: endpoint-contract-audit
description: Use when adding or changing marketing-adjacent API routes, request shapes, response payloads, or auth checks. This skill enforces shared ownership validation, suppression gates, normalized response envelopes, and consistent channel semantics.
---

# Endpoint Contract Audit

Read these docs before editing a marketing-adjacent route:

- `docs/marketing/endpoint-inventory.md`
- `docs/marketing/channel-workflow-contract.md`
- `docs/marketing/source-of-truth-map.md`

## Route guardrails

- All marketing-adjacent routes must require auth.
- Verify the acting user owns or can legitimately access the property, contact, campaign, audience, or phone number being used.
- Normalize `profiles` versus `user_profiles` access instead of mixing them ad hoc.
- Enforce global suppression and consent checks before send or call actions.
- Return the standard API envelope from `src/lib/api/response.ts`.

## Contract checks

- Requests should use predictable field names across SMS, email, voice, activity, contacts, and imports.
- Responses should surface review state, launch state, and failure reasons in a channel-neutral shape where possible.
- Logging must feed the unified inbox contract instead of only channel-local tables.
- Webhook handlers must map provider statuses into the shared channel status vocabulary.

## Audit output

When you finish a route change, note:

- ownership check path
- suppression gate path
- normalized request shape
- normalized response shape
- inbox logging behavior
- analytics status mapping
