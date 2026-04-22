---
name: marketing-workflow-builder
description: Use when implementing or updating the /marketing workflow builder, workflow graph persistence, launch snapshotting, runner handoff, or consent-aware review and launch behavior for workflow campaigns.
---

# Marketing Workflow Builder

Read these docs first:

- `docs/marketing/marketing-command-center-spec.md`
- `docs/marketing/channel-workflow-contract.md`
- `docs/marketing/source-of-truth-map.md`
- `docs/marketing/qa-matrix.md`

## Builder contract

- The builder is a fixed-lane canvas: `Logic`, `SMS`, `Email`, `Voicemail`.
- The UI may be multi-lane, but execution stays one globally ordered DAG.
- Show sequence numbers on blocks so users can see real send order.
- The editable draft graph is the source of truth for draft workflow editing.
- Launched workflow versions are immutable snapshots.
- Legacy single-channel campaigns stay supported and should convert into starter flows when editable.
- Running legacy campaigns render as read-only converted flows.

## Data and launch rules

- Draft graph changes should persist through the workflow API, not through ad hoc local state alone.
- Review and launch must enforce destination-level consent for automated SMS and email.
- Launch snapshots create contact runs and queue the first due step instead of sending inline in the request.
- Keep review counts explicit across `eligible`, `suppressed`, `missing_destination`, and `missing_consent`.
- Direct-send routes and workflow launches must share the same consent and suppression gates.

## Before landing a change

- Confirm drag, reorder, save, and reload preserve both lane placement and global order.
- Confirm inspector edits stay in sync with the canvas, preview, and saved draft.
- Confirm the latest launched version is surfaced separately from the editable draft.
- Confirm launch creates an immutable snapshot and seeds runner state instead of sending immediately.
