---
name: marketing-command-center-spec
description: Use when designing or implementing campaigns, audiences, inbox, analytics, or related data models for the marketing command center. This skill anchors work to the review-first, user-owned, manual-launch contract and the shared marketing docs.
---

# Marketing Command Center Spec

Read the spec documents first:

- `docs/marketing/marketing-command-center-spec.md`
- `docs/marketing/channel-workflow-contract.md`
- `docs/marketing/source-of-truth-map.md`

## Product contract

- V1 is general CRM marketing for leads plus CSV imports.
- Campaigns are user-owned.
- Launch is manual only.
- Every outbound action is review-first.
- Recorded voicemail is supported; full AI caller behavior is not.
- Unified inbox and analytics must consume the same normalized communication status model.

## Working rules

- Keep builder, audience, inbox, and analytics under the same top-level route family.
- Prefer shared contracts over channel-specific drift.
- Treat campaign enrollment and eligibility as first-class records, not implicit joins.
- Keep suppression, ownership, and consent checks centralized.
- Do not add scheduled sends, branching automation, or autonomous calling in v1.

## Before landing a change

- Check that the new UI or API shape matches the written status model.
- Check that review states exist before any launch-capable mutation.
- Check that inbox visibility and analytics derive from the same canonical event fields.
