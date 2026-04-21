# Channel Workflow Contract

## Shared review-first workflow

Every outbound marketing action follows the same sequence:

1. Configure content and audience
2. Preview channel output
3. Review eligibility, ownership, and suppression results
4. Confirm launch
5. Persist launch outcome and expose it in inbox and analytics

No route or UI action may send or call directly from step 1.

## Eligibility rules

An enrollment is launchable only when all checks pass:

- campaign owner matches current user
- property belongs to the current user or permitted team scope
- contact belongs to that property
- required destination exists for the chosen channel
- destination is normalized and valid
- destination is not globally suppressed
- consent requirements for the channel are satisfied

Failure reasons are explicit and user-visible:

- suppressed
- missing destination
- invalid destination
- ownership mismatch
- duplicate enrollment
- converted or excluded

## SMS

- SMS launches create or update a communication thread keyed by owner plus contact plus property plus destination.
- Provider delivery states map into `queued`, `sent`, `delivered`, `failed`, or `replied`.
- Inbound `STOP` and equivalent keywords create or update a global suppression row for SMS.
- Inbound `START` or explicit manual unsuppress can resolve a prior SMS suppression row.
- SMS replies mark the thread as `needs_reply` unless the user archives or resolves it.

## Email

- Email launches always log into the shared communication model, even when no existing property-specific communication log row exists.
- Email provider statuses map into `sent`, `delivered`, `bounced`, `replied`, or `failed`.
- Email unsubscribe or complaint signals create or update a global suppression row for email.
- Preview and review screens must show sender identity and reply-to address before launch.

## Voice and voicemail

- Marketing voice uses recorded voicemail assets in v1.
- Launch review must confirm a voicemail asset exists and is playable.
- Provider outcomes map into `voicemail_left`, `answered`, `no_answer`, or `failed`.
- Recording and transcript artifacts belong to the communication event and thread detail, not just the raw call row.
- Dialer live-call flows remain separate from marketing voice workflows.

## Inbox semantics

The unified inbox is thread-based.

- A thread groups SMS, email, voice, voicemail, notes, and activity for the same owner and contact context.
- Thread detail is chronological and uses normalized event types.
- Replyable events are SMS and email.
- Voice and voicemail events are reviewable but not directly replyable.
- Notes and activity entries enrich thread context but do not affect delivery analytics.

Default inbox queue filters:

- needs reply
- failed delivery
- review required
- recent activity

## Analytics contract

Analytics counts must derive from the same normalized communication status values used in the inbox.

Tracked counts:

- sent
- delivered
- replied
- answered
- voicemail left
- failed
- converted

If a channel cannot map a provider outcome to one of those values, it must fall back to a documented normalized status instead of inventing a new UI label.
