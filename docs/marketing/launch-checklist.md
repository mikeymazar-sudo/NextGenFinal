# Launch Checklist

## Contract and docs

- [ ] marketing command center spec is current
- [ ] endpoint inventory reflects shipped routes
- [ ] workflow contract covers SMS, email, and voicemail
- [ ] webhook expectations are documented
- [ ] source-of-truth map matches the data model

## Data and backend

- [ ] campaigns, steps, enrollments, suppressions, threads, and voicemail assets exist
- [ ] historical messages and calls are backfilled or handled safely
- [ ] ownership checks pass for all marketing-adjacent routes
- [ ] suppression and consent gates run before outbound actions
- [ ] inbox query layer includes SMS, email, voice, voicemail, transcripts, notes, and activity
- [ ] analytics counts use the normalized status model

## UI

- [ ] desktop and mobile navigation both expose `Marketing`
- [ ] page shell follows protected layout conventions
- [ ] builder, audience, inbox, and analytics surfaces are present
- [ ] loading, empty, import pending, review required, suppressed, partial failure, launched, destructive, and disabled states are explicit
- [ ] provider naming does not leak into user-facing marketing UI

## Verification

- [ ] manual review-first flow passes from draft to launch
- [ ] CSV imports create usable campaign audiences without duplicates or orphans
- [ ] suppression blocks SMS, email, and voicemail actions when expected
- [ ] inbox and analytics stay in sync for sent, delivered, replied, answered, voicemail left, failed, and converted counts
- [ ] lint or equivalent verification passes
- [ ] branch is staged, committed, and pushed to `codex/marketing-command-center`
