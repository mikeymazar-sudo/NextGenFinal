# Source Of Truth Map

## Actor and ownership

- auth identity: `auth.users`
- normalized actor profile: shared helper that resolves `profiles` first and falls back to `user_profiles` during migration
- user-owned number assignment: `user_phone_numbers`

## Leads and audience

- lead record: `properties`
- lead list metadata: `lead_lists`
- contact destinations: `contacts`
- import source rows: CSV payload processed through `properties/import`
- durable campaign audience membership: `campaign_enrollments`

## Campaign execution

- campaign definition: `campaigns`
- ordered campaign actions: `campaign_steps`
- reusable recorded clips: `voicemail_assets`
- suppression and consent overrides: `global_suppressions`

## Communication history

- SMS source rows: `messages`
- email source rows: `communication_logs`
- voice source rows: `calls`
- contextual notes: `notes`
- status and operational activity: `activity_log`
- inbox thread summary: `communication_threads`

## UI surfaces

- builder: `campaigns`, `campaign_steps`, audience summary from `campaign_enrollments`
- audience/imports: `lead_lists`, `properties`, `contacts`, import results, `campaign_enrollments`
- inbox: `communication_threads` plus normalized unions from `messages`, `communication_logs`, `calls`, `notes`, and `activity_log`
- analytics: normalized status aggregates from campaign enrollments and communication events

## Status ownership

- provider-specific statuses stay on raw source rows such as `messages.twilio_status` or call-provider fields
- normalized statuses live on communication-thread summaries and campaign-enrollment delivery state
- UI labels and analytics always use normalized statuses, never provider status strings directly
