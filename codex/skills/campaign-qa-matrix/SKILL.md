---
name: campaign-qa-matrix
description: Use when verifying the marketing command center. This skill organizes route checks, manual smoke tests, edge states, and launch-readiness updates for campaigns, imports, inbox, analytics, and UI consistency.
---

# Campaign QA Matrix

Use this skill when building verification plans, smoke checks, or launch-readiness notes for the marketing command center.

Read:

- `docs/marketing/qa-matrix.md`
- `docs/marketing/launch-checklist.md`
- `docs/marketing/ui-consistency-checklist.md`

## Coverage areas

- auth and ownership validation
- suppression and consent behavior
- CSV import to audience enrollment flow
- review-first draft to launch flow
- unified inbox visibility for SMS, email, call, voicemail, transcript, and notes
- analytics count parity with inbox status semantics
- desktop and mobile navigation parity
- loading, empty, review-required, partial-failure, and launched states

## Verification habits

- Prefer checks that mirror real user flows, not only happy-path payload assertions.
- Record what is verified, what is assumed, and what could not be executed locally.
- If a fix changes a contract, update the matching docs and checklist in the same branch.
