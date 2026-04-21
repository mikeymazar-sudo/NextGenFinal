---
name: ui-consistency-guardrails
description: Use when building or reviewing protected-shell UI in this repo, especially the marketing command center. This skill preserves the existing app shell, navigation parity, spacing, state patterns, responsive behavior, and terminology while defining when to use split panes, cards, timelines, tabs, dialogs, and review-first flows.
---

# UI Consistency Guardrails

This is the repo-specific source of truth for protected-shell UI decisions.

Read these files before introducing a new top-level protected route or changing navigation:

- `src/app/(protected)/layout.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/layout/mobile-nav.tsx`
- `src/app/(protected)/leads/page.tsx`
- `src/app/(protected)/dialer/page.tsx`

For the marketing command center, also read:

- `docs/marketing/marketing-command-center-spec.md`
- `docs/marketing/channel-workflow-contract.md`
- `docs/marketing/ui-consistency-checklist.md`

## Protected shell rules

- The marketing page must feel like another protected route, not a new product.
- Use the existing shell with the standard `Header`, sidebar offset, and centered page container.
- Keep top-level page structure sparse: page header first, primary working surface second, supporting sections after that.
- Match the current page heading rhythm used by leads and dialer: title, short operational subtitle, then action cluster.

## Navigation parity

- Desktop and mobile nav must expose the same primary route set in the same order.
- Active state logic must match across sidebar and mobile sheet, including nested routes.
- Do not introduce a marketing-only secondary nav in the global shell. Marketing subsections belong on the page itself.

## Surface selection

- Use a split pane when the user needs a queue plus a live detail view on the same screen.
- Use a timeline when the user is scanning chronological communication history or review events.
- Use cards only when the card itself is the unit of interaction, such as a campaign summary, metric group, or import batch.
- Use tabs for sibling surfaces with stable information architecture. Do not use tabs to hide critical actions.
- Use dialogs for short confirmation, focused editing, or destructive review. Use full-page or pane flows for multi-step creation and launch.

## Spacing and hierarchy

- Default page sections to `space-y-6` unless a denser sub-surface already establishes its own spacing.
- Prefer one dominant primary surface per section.
- Keep action clusters compact and aligned to the page header or section header they affect.

## State patterns

Every major marketing surface must have explicit UI for:

- loading
- empty
- import pending
- review required
- suppressed or ineligible
- partial failure
- sent or launched
- destructive confirmation
- disabled or unavailable actions

Status messaging should explain what happened, what is blocked, and what the next action is.

## Review-first flow

For create or launch actions, use this order:

1. configure
2. preview
3. review eligibility and ownership
4. confirm launch
5. show post-launch or failure results

Do not let send-capable controls skip the review state.

## Dense command-center guidance

- Builder and next actions are primary.
- Inbox detail is contextual and should pair with a queue or thread list.
- Analytics are summary-first and should not crowd the creation flow.
- For inbox and activity, favor a split pane with a queue on the left and thread detail on the right on desktop; collapse to stacked sections on mobile.

## Mobile rules

- No horizontal overflow in the protected shell.
- Tables and wide metric clusters must wrap, stack, or scroll within their own region.
- Tap targets should stay comfortable in the mobile sheet and page-level controls.
- Preserve access to primary actions without forcing the user to traverse hidden desktop-only affordances.

## Naming and file placement

- Route entrypoints live under `src/app/(protected)/marketing/...`.
- Shared marketing UI belongs under `src/components/marketing/...`.
- Shared marketing hooks belong under `src/hooks/...` with `use-` prefixes.
- Shared marketing types extend `src/types/schema.ts` until the repo introduces a broader domain split.
- API helpers or normalization utilities belong under `src/lib/...` in domain-specific folders.

## Terminology cleanup

- User-facing UI should talk about SMS, email, voice, voicemail, inbox, campaigns, and phone numbers.
- Do not expose provider names such as SignalWire or Twilio in labels, empty states, confirmations, or analytics copy unless the screen is explicitly about provider configuration.
- When internal code still uses `twilio_*` or provider-specific names, map them to neutral UI language at the boundary.

## Steward review checklist

Before a UI slice is considered done, verify:

- route and nav parity
- page shell alignment
- section hierarchy and spacing
- tabs, dialogs, and drawers behavior
- responsive behavior
- terminology consistency
- explicit edge-state coverage
