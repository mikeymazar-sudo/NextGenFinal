# Marketing Command Center Spec

## Intent

Build `/marketing` as a first-class protected route for user-owned, review-first campaigns across SMS, email, and recorded voicemail.

V1 defaults:

- general CRM only
- leads plus CSV imports
- user-owned campaigns
- manual launch only
- recorded voicemail, not live AI calling
- unified inbox
- global suppression
- convert imported rows into usable leads and campaign audiences

Out of scope for v1:

- scheduled sends
- branching automation
- autonomous callers
- shared multi-user campaign ownership

## Primary surfaces

`/marketing` contains four coordinated surfaces:

1. Builder
2. Audience and imports
3. Unified inbox
4. Analytics

Builder and next actions are primary.
Inbox detail is contextual.
Analytics are summary-first.

## Ownership model

- Every campaign has exactly one `owner_user_id`.
- Team context is optional metadata, not shared execution authority in v1.
- All reads and writes must verify ownership of the campaign plus any linked property, contact, import batch, phone number, and communication row.
- New route helpers should return one normalized actor profile shape and stop querying `profiles` and `user_profiles` ad hoc inside individual routes.
- During migration, profile lookup may fall back from `profiles` to `user_profiles`, but all new code should consume one shared resolver.

## Required data model

Add first-class records for:

- `campaigns`
- `campaign_steps`
- `campaign_enrollments`
- `communication_threads`
- `global_suppressions`
- `voicemail_assets`

Keep using existing primitives for:

- `properties`
- `contacts`
- `messages`
- `calls`
- `communication_logs`
- `notes`
- `activity_log`
- `user_phone_numbers`

### Campaigns

One row per user-owned campaign draft or launched campaign.

Required fields:

- `id`
- `owner_user_id`
- `team_id`
- `name`
- `channel`
- `status`
- `review_state`
- `launch_state`
- `audience_source_type`
- `audience_source_id`
- `draft_payload`
- `launched_at`
- `created_at`
- `updated_at`

### Campaign steps

One row per explicit execution step in a campaign.

Required fields:

- `id`
- `campaign_id`
- `step_order`
- `channel`
- `action_type`
- `content_payload`
- `template_label`
- `voicemail_asset_id`
- `review_state`
- `execution_status`

### Campaign enrollments

One row per campaign-target pair.

Required fields:

- `id`
- `campaign_id`
- `property_id`
- `contact_id`
- `eligibility_status`
- `eligibility_reason`
- `review_state`
- `delivery_status`
- `last_communication_id`
- `latest_channel`
- `source_type`
- `source_id`

### Communication threads

One row per inbox thread for a user and destination.

Required fields:

- `id`
- `owner_user_id`
- `property_id`
- `contact_id`
- `campaign_id`
- `thread_key`
- `primary_channel`
- `last_direction`
- `last_status`
- `last_event_at`
- `unread_count`
- `needs_reply`

### Global suppressions

One row per suppressed destination or contact.

Required fields:

- `id`
- `owner_user_id`
- `property_id`
- `contact_id`
- `channel`
- `destination`
- `reason`
- `source`
- `status`
- `suppressed_at`
- `resolved_at`

### Voicemail assets

One row per reusable recorded clip.

Required fields:

- `id`
- `owner_user_id`
- `label`
- `storage_path`
- `duration_seconds`
- `transcript`
- `status`

## Lifecycle contract

Campaign lifecycle:

- `draft`
- `review_required`
- `approved`
- `launching`
- `active`
- `partially_failed`
- `completed`
- `failed`
- `archived`

Enrollment eligibility:

- `eligible`
- `suppressed`
- `missing_destination`
- `invalid_destination`
- `duplicate`
- `unowned`
- `excluded`
- `converted`

Normalized communication status:

- `queued`
- `sent`
- `delivered`
- `replied`
- `answered`
- `voicemail_left`
- `failed`
- `suppressed`
- `bounced`
- `no_answer`

Analytics, inbox badges, and review queues must consume the same normalized communication status values.

## Review-first rules

- No send or call mutation may bypass review state.
- Builder flow must always be `configure -> preview -> eligibility review -> confirm -> launch result`.
- Review surfaces must show suppression, missing ownership, and invalid destination reasons before launch.
- Partial failures must be visible at both campaign and enrollment level.

## Voice contract

Marketing voice is voicemail-first in v1.

- Campaign voice steps leave a recorded message using a stored voicemail asset.
- Live bridge calling stays in the dialer, not in the marketing campaign runner.
- Voice campaign outcomes map to the shared status model with `voicemail_left`, `answered`, `no_answer`, or `failed`.
- If a live answer occurs during a voicemail campaign step, the outcome is recorded and surfaced in the inbox, but the workflow does not escalate into live agent handling inside marketing.
