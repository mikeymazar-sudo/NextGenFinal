-- Marketing workflow runner slice
--
-- This migration adds the immutable workflow versioning and run-state tables
-- that the Supabase Edge Function runner claims and advances.
-- It also wires a pg_cron + pg_net job that calls the edge function on a schedule.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS vault;

CREATE TABLE IF NOT EXISTS public.campaign_workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (
    state IN ('draft', 'snapshot', 'launched', 'archived')
  ),
  entry_step_id UUID,
  graph_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  launched_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (version_number > 0)
);

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_channel_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_channel_check
  CHECK (channel IN ('sms', 'email', 'voice', 'multi'));

ALTER TABLE public.campaign_steps
  ADD COLUMN IF NOT EXISTS node_kind TEXT,
  ADD COLUMN IF NOT EXISTS lane_key TEXT,
  ADD COLUMN IF NOT EXISTS node_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS version_id UUID;

ALTER TABLE public.campaign_steps
  DROP CONSTRAINT IF EXISTS campaign_steps_version_id_fkey;

ALTER TABLE public.campaign_steps
  ADD CONSTRAINT campaign_steps_version_id_fkey
  FOREIGN KEY (version_id) REFERENCES public.campaign_workflow_versions(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_steps
  DROP CONSTRAINT IF EXISTS campaign_steps_node_kind_check;

ALTER TABLE public.campaign_steps
  DROP CONSTRAINT IF EXISTS campaign_steps_channel_check;

ALTER TABLE public.campaign_steps
  ALTER COLUMN channel DROP NOT NULL;

ALTER TABLE public.campaign_steps
  ADD CONSTRAINT campaign_steps_channel_check
  CHECK (channel IS NULL OR channel IN ('sms', 'email', 'voice'));

ALTER TABLE public.campaign_steps
  ADD CONSTRAINT campaign_steps_node_kind_check
  CHECK (node_kind IS NULL OR node_kind IN ('sms', 'email', 'voicemail', 'wait', 'condition', 'exit'));

ALTER TABLE public.campaign_steps
  DROP CONSTRAINT IF EXISTS campaign_steps_lane_key_check;

ALTER TABLE public.campaign_steps
  ADD CONSTRAINT campaign_steps_lane_key_check
  CHECK (lane_key IS NULL OR lane_key IN ('logic', 'sms', 'email', 'voicemail'));

DROP INDEX IF EXISTS idx_campaign_steps_campaign_id_step_order;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_steps_campaign_version_step_order
  ON public.campaign_steps(campaign_id, version_id, step_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_steps_campaign_step_order_legacy
  ON public.campaign_steps(campaign_id, step_order)
  WHERE version_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_steps_version_id
  ON public.campaign_steps(version_id);

CREATE TABLE IF NOT EXISTS public.campaign_step_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.campaign_workflow_versions(id) ON DELETE CASCADE,
  from_step_id UUID NOT NULL REFERENCES public.campaign_steps(id) ON DELETE CASCADE,
  to_step_id UUID NOT NULL REFERENCES public.campaign_steps(id) ON DELETE CASCADE,
  branch_key TEXT NOT NULL DEFAULT 'next' CHECK (branch_key IN ('next', 'true', 'false')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sort_order >= 0)
);

CREATE TABLE IF NOT EXISTS public.campaign_contact_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workflow_version_id UUID NOT NULL REFERENCES public.campaign_workflow_versions(id) ON DELETE CASCADE,
  campaign_enrollment_id UUID NOT NULL REFERENCES public.campaign_enrollments(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  primary_channel TEXT NOT NULL CHECK (primary_channel IN ('sms', 'email', 'voice')),
  destination TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (
    consent_status IN ('granted', 'denied', 'unknown')
  ),
  consent_source TEXT NOT NULL DEFAULT 'legacy',
  consent_updated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'waiting', 'completed', 'failed', 'stopped', 'suppressed')
  ),
  current_step_order INTEGER NOT NULL DEFAULT 1,
  last_step_run_id UUID,
  next_due_at TIMESTAMPTZ,
  launched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  stop_reason TEXT,
  execution_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (current_step_order > 0)
);

CREATE TABLE IF NOT EXISTS public.campaign_step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workflow_version_id UUID NOT NULL REFERENCES public.campaign_workflow_versions(id) ON DELETE CASCADE,
  campaign_contact_run_id UUID NOT NULL REFERENCES public.campaign_contact_runs(id) ON DELETE CASCADE,
  campaign_step_id UUID NOT NULL REFERENCES public.campaign_steps(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  node_kind TEXT NOT NULL CHECK (node_kind IN ('sms', 'email', 'voicemail', 'wait', 'condition', 'exit')),
  lane_key TEXT NOT NULL CHECK (lane_key IN ('logic', 'sms', 'email', 'voicemail')),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'claimed', 'running', 'completed', 'failed', 'skipped')
  ),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  provider_reference TEXT,
  next_step_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (step_order > 0),
  CHECK (attempt_count >= 0)
);

ALTER TABLE public.campaign_workflow_versions
  ADD CONSTRAINT campaign_workflow_versions_entry_step_id_fkey
  FOREIGN KEY (entry_step_id) REFERENCES public.campaign_steps(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_contact_runs
  ADD CONSTRAINT campaign_contact_runs_last_step_run_id_fkey
  FOREIGN KEY (last_step_run_id) REFERENCES public.campaign_step_runs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_workflow_versions_campaign_version
  ON public.campaign_workflow_versions(campaign_id, version_number);

CREATE INDEX IF NOT EXISTS idx_campaign_workflow_versions_campaign_id
  ON public.campaign_workflow_versions(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_workflow_versions_state
  ON public.campaign_workflow_versions(state);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_step_edges_version_from_branch
  ON public.campaign_step_edges(version_id, from_step_id, branch_key);

CREATE INDEX IF NOT EXISTS idx_campaign_step_edges_version_id
  ON public.campaign_step_edges(version_id);

CREATE INDEX IF NOT EXISTS idx_campaign_step_edges_from_step_id
  ON public.campaign_step_edges(from_step_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_contact_runs_campaign_version_enrollment
  ON public.campaign_contact_runs(campaign_id, workflow_version_id, campaign_enrollment_id);

CREATE INDEX IF NOT EXISTS idx_campaign_contact_runs_campaign_id
  ON public.campaign_contact_runs(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_contact_runs_workflow_version_id
  ON public.campaign_contact_runs(workflow_version_id);

CREATE INDEX IF NOT EXISTS idx_campaign_contact_runs_status
  ON public.campaign_contact_runs(status);

CREATE INDEX IF NOT EXISTS idx_campaign_contact_runs_next_due_at
  ON public.campaign_contact_runs(next_due_at);

CREATE INDEX IF NOT EXISTS idx_campaign_step_runs_campaign_contact_run_id
  ON public.campaign_step_runs(campaign_contact_run_id);

CREATE INDEX IF NOT EXISTS idx_campaign_step_runs_campaign_id
  ON public.campaign_step_runs(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_step_runs_workflow_version_id
  ON public.campaign_step_runs(workflow_version_id);

CREATE INDEX IF NOT EXISTS idx_campaign_step_runs_status_due
  ON public.campaign_step_runs(status, scheduled_for);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_step_runs_idempotency_key
  ON public.campaign_step_runs(idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_step_runs_contact_step_order
  ON public.campaign_step_runs(campaign_contact_run_id, step_order);

DROP TRIGGER IF EXISTS campaign_workflow_versions_updated_at_trigger ON public.campaign_workflow_versions;
CREATE TRIGGER campaign_workflow_versions_updated_at_trigger
  BEFORE UPDATE ON public.campaign_workflow_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

DROP TRIGGER IF EXISTS campaign_step_edges_updated_at_trigger ON public.campaign_step_edges;
CREATE TRIGGER campaign_step_edges_updated_at_trigger
  BEFORE UPDATE ON public.campaign_step_edges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

DROP TRIGGER IF EXISTS campaign_contact_runs_updated_at_trigger ON public.campaign_contact_runs;
CREATE TRIGGER campaign_contact_runs_updated_at_trigger
  BEFORE UPDATE ON public.campaign_contact_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

DROP TRIGGER IF EXISTS campaign_step_runs_updated_at_trigger ON public.campaign_step_runs;
CREATE TRIGGER campaign_step_runs_updated_at_trigger
  BEFORE UPDATE ON public.campaign_step_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

CREATE OR REPLACE FUNCTION public.next_campaign_workflow_version_number(p_campaign_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(version_number), 0) + 1
  FROM public.campaign_workflow_versions
  WHERE campaign_id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_campaign_step_runs(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.campaign_step_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.campaign_step_runs csr
  SET
    status = 'claimed',
    claimed_at = NOW(),
    claimed_by = 'marketing-workflow-runner',
    attempt_count = csr.attempt_count + 1,
    updated_at = NOW()
  WHERE csr.id IN (
    SELECT id
    FROM public.campaign_step_runs
    WHERE status = 'queued'
      AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC, created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 1), 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_campaign_step_run(
  p_campaign_id UUID,
  p_workflow_version_id UUID,
  p_campaign_contact_run_id UUID,
  p_campaign_step_id UUID,
  p_step_order INTEGER,
  p_node_kind TEXT,
  p_lane_key TEXT,
  p_scheduled_for TIMESTAMPTZ,
  p_idempotency_key TEXT,
  p_input_payload JSONB DEFAULT '{}'::jsonb,
  p_output_payload JSONB DEFAULT '{}'::jsonb,
  p_status TEXT DEFAULT 'queued',
  p_provider_reference TEXT DEFAULT NULL,
  p_next_step_order INTEGER DEFAULT NULL
)
RETURNS public.campaign_step_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.campaign_step_runs;
BEGIN
  INSERT INTO public.campaign_step_runs (
    campaign_id,
    workflow_version_id,
    campaign_contact_run_id,
    campaign_step_id,
    step_order,
    node_kind,
    lane_key,
    idempotency_key,
    status,
    scheduled_for,
    input_payload,
    output_payload,
    provider_reference,
    next_step_order
  )
  VALUES (
    p_campaign_id,
    p_workflow_version_id,
    p_campaign_contact_run_id,
    p_campaign_step_id,
    p_step_order,
    p_node_kind,
    p_lane_key,
    p_idempotency_key,
    COALESCE(NULLIF(p_status, ''), 'queued'),
    COALESCE(p_scheduled_for, NOW()),
    COALESCE(p_input_payload, '{}'::jsonb),
    COALESCE(p_output_payload, '{}'::jsonb),
    p_provider_reference,
    p_next_step_order
  )
  ON CONFLICT (idempotency_key)
  DO UPDATE SET
    scheduled_for = LEAST(campaign_step_runs.scheduled_for, EXCLUDED.scheduled_for),
    input_payload = COALESCE(campaign_step_runs.input_payload, '{}'::jsonb),
    output_payload = COALESCE(campaign_step_runs.output_payload, '{}'::jsonb),
    provider_reference = COALESCE(EXCLUDED.provider_reference, campaign_step_runs.provider_reference),
    next_step_order = COALESCE(EXCLUDED.next_step_order, campaign_step_runs.next_step_order),
    updated_at = NOW()
  RETURNING * INTO v_run;

  RETURN v_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_marketing_workflow_runner()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  project_url TEXT;
  runner_secret TEXT;
  request_id BIGINT;
BEGIN
  SELECT decrypted_secret
    INTO project_url
    FROM vault.decrypted_secrets
   WHERE name = 'marketing_runner_project_url'
   LIMIT 1;

  SELECT decrypted_secret
    INTO runner_secret
    FROM vault.decrypted_secrets
   WHERE name = 'marketing_runner_secret'
   LIMIT 1;

  IF project_url IS NULL OR runner_secret IS NULL THEN
    RAISE NOTICE 'Marketing workflow runner secrets are missing; skipping cron invocation.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/marketing-workflow-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-marketing-runner-secret', runner_secret
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'invoked_at', NOW()
    )
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

DO $cleanup$
DECLARE
  v_jobid INTEGER;
BEGIN
  SELECT jobid
    INTO v_jobid
    FROM cron.job
   WHERE jobname = 'marketing-workflow-runner'
   ORDER BY jobid DESC
   LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function THEN
    NULL;
END;
$cleanup$;

DO $schedule$
BEGIN
  PERFORM cron.schedule(
    'marketing-workflow-runner',
    '* * * * *',
    $cmd$SELECT public.invoke_marketing_workflow_runner();$cmd$
  );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_table OR undefined_function THEN
    NULL;
END;
$schedule$;
