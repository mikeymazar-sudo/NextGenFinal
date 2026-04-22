# Marketing Workflow Runner

This Edge Function is the execution target for the Supabase Cron job defined in the workflow runner migration.

## What it does

- claims due `campaign_step_runs`
- executes one step per claimed row
- writes the terminal step result back to Postgres
- enqueues the next step run when the graph has a successor

## Required secrets and env vars

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MARKETING_WORKFLOW_RUNNER_SECRET`
- `SIGNALWIRE_PROJECT_ID`
- `SIGNALWIRE_API_TOKEN`
- `SIGNALWIRE_SPACE_URL`
- `RESEND_API_KEY`

Helpful extras for launch and reply routing:

- `MARKETING_APP_BASE_URL`
- `MARKETING_EMAIL_REPLY_TO_DOMAIN`
- `MARKETING_REPLY_TOKEN_SECRET`
- `MARKETING_EMAIL_FROM_ADDRESS`
- `SIGNALWIRE_PHONE_NUMBER`

## Cron wiring

The migration expects two Vault secrets:

- `marketing_runner_project_url`
- `marketing_runner_secret`

The cron job posts to `/functions/v1/marketing-workflow-runner` with the shared secret in `x-marketing-runner-secret`.

## Local smoke test

```bash
supabase functions serve marketing-workflow-runner --no-verify-jwt
curl -X POST http://127.0.0.1:54321/functions/v1/marketing-workflow-runner \
  -H "Content-Type: application/json" \
  -H "x-marketing-runner-secret: $MARKETING_WORKFLOW_RUNNER_SECRET" \
  -d '{"batch_size": 5, "dry_run": true, "source": "local"}'
```

