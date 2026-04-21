# UI Consistency Checklist

## Shell and navigation

- [ ] `Marketing` exists in both desktop and mobile navigation
- [ ] active-state logic matches between sidebar and mobile sheet
- [ ] protected shell spacing, header, and content width match existing routes

## Page hierarchy

- [ ] page starts with a concise title, subtitle, and action cluster
- [ ] builder and next actions are primary
- [ ] inbox detail is contextual
- [ ] analytics are summary-first

## Component usage

- [ ] split panes are used for queue plus detail
- [ ] timelines are used for chronological communication detail
- [ ] cards are used only when the card itself is the unit of interaction
- [ ] dialogs are limited to short confirm or focused edit flows
- [ ] tabs group stable peer surfaces rather than hiding critical actions

## State coverage

- [ ] loading
- [ ] empty
- [ ] import pending
- [ ] review required
- [ ] suppressed or ineligible
- [ ] partial failure
- [ ] sent or launched
- [ ] destructive confirmation
- [ ] disabled action

## Responsive behavior

- [ ] no page-level horizontal overflow
- [ ] dense surfaces remain readable on mobile
- [ ] touch targets stay accessible
- [ ] primary actions are reachable without desktop-only affordances

## Terminology

- [ ] user-facing labels say SMS, email, voice, voicemail, inbox, campaigns, or phone numbers
- [ ] SignalWire or Twilio naming does not leak into end-user marketing UI
