-- Marketing command center schema, policies, and historical backfill

CREATE OR REPLACE FUNCTION public.update_marketing_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_thread_key(
  p_owner_user_id uuid,
  p_property_id uuid,
  p_contact_id uuid,
  p_destination text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT concat_ws(
    ':',
    coalesce(p_owner_user_id::text, 'null'),
    coalesce(p_property_id::text, 'null'),
    coalesce(p_contact_id::text, 'null'),
    lower(coalesce(btrim(p_destination), 'null'))
  );
$$;

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'voice')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'review_required',
      'approved',
      'launching',
      'active',
      'partially_failed',
      'completed',
      'failed',
      'archived'
    )
  ),
  review_state TEXT NOT NULL DEFAULT 'draft' CHECK (
    review_state IN ('draft', 'review_required', 'approved', 'rejected')
  ),
  launch_state TEXT NOT NULL DEFAULT 'idle',
  audience_source_type TEXT,
  audience_source_id UUID,
  draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  launched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voicemail_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  duration_seconds INTEGER,
  transcript TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'archived', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

CREATE TABLE IF NOT EXISTS public.campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'voice')),
  action_type TEXT NOT NULL,
  content_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_label TEXT,
  voicemail_asset_id UUID REFERENCES public.voicemail_assets(id) ON DELETE SET NULL,
  review_state TEXT NOT NULL DEFAULT 'draft' CHECK (
    review_state IN ('draft', 'review_required', 'approved', 'rejected')
  ),
  execution_status TEXT NOT NULL DEFAULT 'queued' CHECK (
    execution_status IN (
      'queued',
      'sent',
      'delivered',
      'replied',
      'answered',
      'voicemail_left',
      'failed',
      'suppressed',
      'bounced',
      'no_answer',
      'skipped'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (step_order > 0)
);

CREATE TABLE IF NOT EXISTS public.campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  eligibility_status TEXT NOT NULL DEFAULT 'eligible' CHECK (
    eligibility_status IN (
      'eligible',
      'suppressed',
      'missing_destination',
      'invalid_destination',
      'duplicate',
      'unowned',
      'excluded',
      'converted'
    )
  ),
  eligibility_reason TEXT,
  review_state TEXT NOT NULL DEFAULT 'draft' CHECK (
    review_state IN ('draft', 'review_required', 'approved', 'rejected')
  ),
  delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK (
    delivery_status IN (
      'queued',
      'sent',
      'delivered',
      'replied',
      'answered',
      'voicemail_left',
      'failed',
      'suppressed',
      'bounced',
      'no_answer'
    )
  ),
  last_communication_id UUID,
  latest_channel TEXT CHECK (latest_channel IN ('sms', 'email', 'voice')),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.communication_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  thread_key TEXT NOT NULL,
  primary_channel TEXT NOT NULL CHECK (primary_channel IN ('sms', 'email', 'voice')),
  last_direction TEXT NOT NULL CHECK (last_direction IN ('inbound', 'outbound')),
  last_status TEXT NOT NULL CHECK (
    last_status IN (
      'queued',
      'sent',
      'delivered',
      'replied',
      'answered',
      'voicemail_left',
      'failed',
      'suppressed',
      'bounced',
      'no_answer'
    )
  ),
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  needs_reply BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.global_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'voice')),
  destination TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (resolved_at IS NULL OR resolved_at >= suppressed_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_steps_campaign_id_step_order
  ON public.campaign_steps(campaign_id, step_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_enrollments_campaign_target
  ON public.campaign_enrollments(campaign_id, property_id, contact_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_threads_owner_thread_key
  ON public.communication_threads(owner_user_id, thread_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_suppressions_owner_channel_destination
  ON public.global_suppressions(owner_user_id, channel, destination);

CREATE INDEX IF NOT EXISTS idx_campaigns_owner_user_id ON public.campaigns(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_team_id ON public.campaigns(team_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_channel ON public.campaigns(channel);
CREATE INDEX IF NOT EXISTS idx_campaigns_audience_source
  ON public.campaigns(audience_source_type, audience_source_id);

CREATE INDEX IF NOT EXISTS idx_voicemail_assets_owner_user_id ON public.voicemail_assets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_voicemail_assets_status ON public.voicemail_assets(status);

CREATE INDEX IF NOT EXISTS idx_campaign_steps_campaign_id ON public.campaign_steps(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_steps_voicemail_asset_id ON public.campaign_steps(voicemail_asset_id);

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_property_id ON public.campaign_enrollments(property_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_contact_id ON public.campaign_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_eligibility_status
  ON public.campaign_enrollments(eligibility_status);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_delivery_status
  ON public.campaign_enrollments(delivery_status);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_latest_channel
  ON public.campaign_enrollments(latest_channel);

CREATE INDEX IF NOT EXISTS idx_communication_threads_campaign_id
  ON public.communication_threads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_communication_threads_property_id
  ON public.communication_threads(property_id);
CREATE INDEX IF NOT EXISTS idx_communication_threads_contact_id
  ON public.communication_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_communication_threads_last_event_at
  ON public.communication_threads(last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_threads_needs_reply
  ON public.communication_threads(needs_reply);
CREATE INDEX IF NOT EXISTS idx_communication_threads_last_status
  ON public.communication_threads(last_status);

CREATE INDEX IF NOT EXISTS idx_global_suppressions_owner_user_id
  ON public.global_suppressions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_global_suppressions_status
  ON public.global_suppressions(status);
CREATE INDEX IF NOT EXISTS idx_global_suppressions_channel
  ON public.global_suppressions(channel);

DROP TRIGGER IF EXISTS campaigns_updated_at_trigger ON public.campaigns;
CREATE TRIGGER campaigns_updated_at_trigger
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

DROP TRIGGER IF EXISTS voicemail_assets_updated_at_trigger ON public.voicemail_assets;
CREATE TRIGGER voicemail_assets_updated_at_trigger
  BEFORE UPDATE ON public.voicemail_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

DROP TRIGGER IF EXISTS campaign_steps_updated_at_trigger ON public.campaign_steps;
CREATE TRIGGER campaign_steps_updated_at_trigger
  BEFORE UPDATE ON public.campaign_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

DROP TRIGGER IF EXISTS campaign_enrollments_updated_at_trigger ON public.campaign_enrollments;
CREATE TRIGGER campaign_enrollments_updated_at_trigger
  BEFORE UPDATE ON public.campaign_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

DROP TRIGGER IF EXISTS communication_threads_updated_at_trigger ON public.communication_threads;
CREATE TRIGGER communication_threads_updated_at_trigger
  BEFORE UPDATE ON public.communication_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

DROP TRIGGER IF EXISTS global_suppressions_updated_at_trigger ON public.global_suppressions;
CREATE TRIGGER global_suppressions_updated_at_trigger
  BEFORE UPDATE ON public.global_suppressions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_marketing_updated_at();

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voicemail_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own campaigns" ON public.campaigns;
CREATE POLICY "Users can view own campaigns"
  ON public.campaigns
  FOR SELECT
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.campaigns;
CREATE POLICY "Users can insert own campaigns"
  ON public.campaigns
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can update own campaigns" ON public.campaigns;
CREATE POLICY "Users can update own campaigns"
  ON public.campaigns
  FOR UPDATE
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can delete own campaigns" ON public.campaigns;
CREATE POLICY "Users can delete own campaigns"
  ON public.campaigns
  FOR DELETE
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can view own voicemail assets" ON public.voicemail_assets;
CREATE POLICY "Users can view own voicemail assets"
  ON public.voicemail_assets
  FOR SELECT
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can insert own voicemail assets" ON public.voicemail_assets;
CREATE POLICY "Users can insert own voicemail assets"
  ON public.voicemail_assets
  FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can update own voicemail assets" ON public.voicemail_assets;
CREATE POLICY "Users can update own voicemail assets"
  ON public.voicemail_assets
  FOR UPDATE
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can delete own voicemail assets" ON public.voicemail_assets;
CREATE POLICY "Users can delete own voicemail assets"
  ON public.voicemail_assets
  FOR DELETE
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can view campaign steps for own campaigns" ON public.campaign_steps;
CREATE POLICY "Users can view campaign steps for own campaigns"
  ON public.campaign_steps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_steps.campaign_id
        AND c.owner_user_id = auth.uid()
    )
    AND (
      campaign_steps.voicemail_asset_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.voicemail_assets v
        WHERE v.id = campaign_steps.voicemail_asset_id
          AND v.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert campaign steps for own campaigns" ON public.campaign_steps;
CREATE POLICY "Users can insert campaign steps for own campaigns"
  ON public.campaign_steps
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_steps.campaign_id
        AND c.owner_user_id = auth.uid()
    )
    AND (
      campaign_steps.voicemail_asset_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.voicemail_assets v
        WHERE v.id = campaign_steps.voicemail_asset_id
          AND v.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update campaign steps for own campaigns" ON public.campaign_steps;
CREATE POLICY "Users can update campaign steps for own campaigns"
  ON public.campaign_steps
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_steps.campaign_id
        AND c.owner_user_id = auth.uid()
    )
    AND (
      campaign_steps.voicemail_asset_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.voicemail_assets v
        WHERE v.id = campaign_steps.voicemail_asset_id
          AND v.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete campaign steps for own campaigns" ON public.campaign_steps;
CREATE POLICY "Users can delete campaign steps for own campaigns"
  ON public.campaign_steps
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_steps.campaign_id
        AND c.owner_user_id = auth.uid()
    )
    AND (
      campaign_steps.voicemail_asset_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.voicemail_assets v
        WHERE v.id = campaign_steps.voicemail_asset_id
          AND v.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can view campaign enrollments for own campaigns" ON public.campaign_enrollments;
CREATE POLICY "Users can view campaign enrollments for own campaigns"
  ON public.campaign_enrollments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.properties p ON p.id = campaign_enrollments.property_id
      JOIN public.contacts ct ON ct.id = campaign_enrollments.contact_id
      WHERE c.id = campaign_enrollments.campaign_id
        AND c.owner_user_id = auth.uid()
        AND p.created_by = auth.uid()
        AND (
          campaign_enrollments.contact_id IS NULL
          OR ct.property_id = p.id
        )
    )
  );

DROP POLICY IF EXISTS "Users can insert campaign enrollments for own campaigns" ON public.campaign_enrollments;
CREATE POLICY "Users can insert campaign enrollments for own campaigns"
  ON public.campaign_enrollments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.properties p ON p.id = campaign_enrollments.property_id
      JOIN public.contacts ct ON ct.id = campaign_enrollments.contact_id
      WHERE c.id = campaign_enrollments.campaign_id
        AND c.owner_user_id = auth.uid()
        AND p.created_by = auth.uid()
        AND (
          campaign_enrollments.contact_id IS NULL
          OR ct.property_id = p.id
        )
    )
  );

DROP POLICY IF EXISTS "Users can update campaign enrollments for own campaigns" ON public.campaign_enrollments;
CREATE POLICY "Users can update campaign enrollments for own campaigns"
  ON public.campaign_enrollments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.properties p ON p.id = campaign_enrollments.property_id
      JOIN public.contacts ct ON ct.id = campaign_enrollments.contact_id
      WHERE c.id = campaign_enrollments.campaign_id
        AND c.owner_user_id = auth.uid()
        AND p.created_by = auth.uid()
        AND (
          campaign_enrollments.contact_id IS NULL
          OR ct.property_id = p.id
        )
    )
  );

DROP POLICY IF EXISTS "Users can delete campaign enrollments for own campaigns" ON public.campaign_enrollments;
CREATE POLICY "Users can delete campaign enrollments for own campaigns"
  ON public.campaign_enrollments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.properties p ON p.id = campaign_enrollments.property_id
      JOIN public.contacts ct ON ct.id = campaign_enrollments.contact_id
      WHERE c.id = campaign_enrollments.campaign_id
        AND c.owner_user_id = auth.uid()
        AND p.created_by = auth.uid()
        AND (
          campaign_enrollments.contact_id IS NULL
          OR ct.property_id = p.id
        )
    )
  );

DROP POLICY IF EXISTS "Users can view their own communication threads" ON public.communication_threads;
CREATE POLICY "Users can view their own communication threads"
  ON public.communication_threads
  FOR SELECT
  USING (
    owner_user_id = auth.uid()
    AND (
      property_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = communication_threads.property_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      property_id IS NULL
      OR contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.contacts ct ON ct.property_id = p.id
        WHERE p.id = communication_threads.property_id
          AND ct.id = communication_threads.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contacts ct
        JOIN public.properties p ON p.id = ct.property_id
        WHERE ct.id = communication_threads.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      campaign_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.campaigns c
        WHERE c.id = communication_threads.campaign_id
          AND c.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert their own communication threads" ON public.communication_threads;
CREATE POLICY "Users can insert their own communication threads"
  ON public.communication_threads
  FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      property_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = communication_threads.property_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      property_id IS NULL
      OR contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.contacts ct ON ct.property_id = p.id
        WHERE p.id = communication_threads.property_id
          AND ct.id = communication_threads.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contacts ct
        JOIN public.properties p ON p.id = ct.property_id
        WHERE ct.id = communication_threads.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      campaign_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.campaigns c
        WHERE c.id = communication_threads.campaign_id
          AND c.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update their own communication threads" ON public.communication_threads;
CREATE POLICY "Users can update their own communication threads"
  ON public.communication_threads
  FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    AND (
      property_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = communication_threads.property_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      property_id IS NULL
      OR contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.contacts ct ON ct.property_id = p.id
        WHERE p.id = communication_threads.property_id
          AND ct.id = communication_threads.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contacts ct
        JOIN public.properties p ON p.id = ct.property_id
        WHERE ct.id = communication_threads.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      campaign_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.campaigns c
        WHERE c.id = communication_threads.campaign_id
          AND c.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete their own communication threads" ON public.communication_threads;
CREATE POLICY "Users can delete their own communication threads"
  ON public.communication_threads
  FOR DELETE
  USING (
    owner_user_id = auth.uid()
    AND (
      property_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = communication_threads.property_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      property_id IS NULL
      OR contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.contacts ct ON ct.property_id = p.id
        WHERE p.id = communication_threads.property_id
          AND ct.id = communication_threads.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contacts ct
        JOIN public.properties p ON p.id = ct.property_id
        WHERE ct.id = communication_threads.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      campaign_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.campaigns c
        WHERE c.id = communication_threads.campaign_id
          AND c.owner_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can view their own suppressions" ON public.global_suppressions;
CREATE POLICY "Users can view their own suppressions"
  ON public.global_suppressions
  FOR SELECT
  USING (
    owner_user_id = auth.uid()
    AND (
      property_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = global_suppressions.property_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      property_id IS NULL
      OR contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.contacts ct ON ct.property_id = p.id
        WHERE p.id = global_suppressions.property_id
          AND ct.id = global_suppressions.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contacts ct
        JOIN public.properties p ON p.id = ct.property_id
        WHERE ct.id = global_suppressions.contact_id
          AND p.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert their own suppressions" ON public.global_suppressions;
CREATE POLICY "Users can insert their own suppressions"
  ON public.global_suppressions
  FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      property_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = global_suppressions.property_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      property_id IS NULL
      OR contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.contacts ct ON ct.property_id = p.id
        WHERE p.id = global_suppressions.property_id
          AND ct.id = global_suppressions.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contacts ct
        JOIN public.properties p ON p.id = ct.property_id
        WHERE ct.id = global_suppressions.contact_id
          AND p.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update their own suppressions" ON public.global_suppressions;
CREATE POLICY "Users can update their own suppressions"
  ON public.global_suppressions
  FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    AND (
      property_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = global_suppressions.property_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      property_id IS NULL
      OR contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.contacts ct ON ct.property_id = p.id
        WHERE p.id = global_suppressions.property_id
          AND ct.id = global_suppressions.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contacts ct
        JOIN public.properties p ON p.id = ct.property_id
        WHERE ct.id = global_suppressions.contact_id
          AND p.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can delete their own suppressions" ON public.global_suppressions;
CREATE POLICY "Users can delete their own suppressions"
  ON public.global_suppressions
  FOR DELETE
  USING (
    owner_user_id = auth.uid()
    AND (
      property_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = global_suppressions.property_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      property_id IS NULL
      OR contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.properties p
        JOIN public.contacts ct ON ct.property_id = p.id
        WHERE p.id = global_suppressions.property_id
          AND ct.id = global_suppressions.contact_id
          AND p.created_by = auth.uid()
      )
    )
    AND (
      contact_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.contacts ct
        JOIN public.properties p ON p.id = ct.property_id
        WHERE ct.id = global_suppressions.contact_id
          AND p.created_by = auth.uid()
      )
    )
  );

-- Backfill thread summaries from existing SMS and call history where the ownership context is recoverable.
WITH message_events AS (
  SELECT
    COALESCE(m.user_id, upn.user_id) AS owner_user_id,
    COALESCE(m.property_id, ct.property_id) AS property_id,
    m.contact_id,
    NULL::uuid AS campaign_id,
    public.marketing_thread_key(
      COALESCE(m.user_id, upn.user_id),
      COALESCE(m.property_id, ct.property_id),
      m.contact_id,
      CASE
        WHEN m.direction = 'inbound' THEN m.from_number
        ELSE m.to_number
      END
    ) AS thread_key,
    'sms'::text AS primary_channel,
    m.direction AS last_direction,
    CASE
      WHEN m.direction = 'inbound' THEN 'replied'
      WHEN m.status IN ('queued', 'pending') THEN 'queued'
      WHEN m.status = 'sent' THEN 'sent'
      WHEN m.status = 'delivered' THEN 'delivered'
      WHEN m.status = 'failed' THEN 'failed'
      WHEN m.status = 'received' THEN 'replied'
      ELSE 'sent'
    END AS last_status,
    m.created_at AS last_event_at,
    1 AS source_rank
  FROM public.messages m
  LEFT JOIN public.user_phone_numbers upn
    ON upn.id = m.user_phone_number_id
  LEFT JOIN public.contacts ct
    ON ct.id = m.contact_id
  WHERE COALESCE(m.user_id, upn.user_id) IS NOT NULL
),
call_events AS (
  SELECT
    c.caller_id AS owner_user_id,
    COALESCE(c.property_id, ct.property_id) AS property_id,
    c.contact_id,
    NULL::uuid AS campaign_id,
    public.marketing_thread_key(
      c.caller_id,
      COALESCE(c.property_id, ct.property_id),
      c.contact_id,
      COALESCE(c.to_number, c.from_number)
    ) AS thread_key,
    'voice'::text AS primary_channel,
    'outbound'::text AS last_direction,
    CASE
      WHEN c.status ILIKE '%busy%' THEN 'no_answer'
      WHEN c.status ILIKE '%no-answer%' OR c.status ILIKE '%no_answer%' THEN 'no_answer'
      WHEN c.status ILIKE '%failed%' OR c.status ILIKE '%cancel%' THEN 'failed'
      WHEN c.status ILIKE '%voicemail%' THEN 'voicemail_left'
      WHEN c.status ILIKE '%completed%' OR c.status ILIKE '%answered%' THEN 'answered'
      ELSE 'answered'
    END AS last_status,
    COALESCE(c.ended_at, c.created_at) AS last_event_at,
    0 AS source_rank
  FROM public.calls c
  LEFT JOIN public.contacts ct
    ON ct.id = c.contact_id
  WHERE c.caller_id IS NOT NULL
),
thread_events AS (
  SELECT * FROM message_events
  UNION ALL
  SELECT * FROM call_events
),
latest_events AS (
  SELECT DISTINCT ON (owner_user_id, thread_key)
    owner_user_id,
    property_id,
    contact_id,
    campaign_id,
    thread_key,
    primary_channel,
    last_direction,
    last_status,
    last_event_at
  FROM thread_events
  ORDER BY owner_user_id, thread_key, last_event_at DESC, source_rank DESC
)
INSERT INTO public.communication_threads (
  id,
  owner_user_id,
  property_id,
  contact_id,
  campaign_id,
  thread_key,
  primary_channel,
  last_direction,
  last_status,
  last_event_at,
  unread_count,
  needs_reply,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  latest.owner_user_id,
  latest.property_id,
  latest.contact_id,
  latest.campaign_id,
  latest.thread_key,
  latest.primary_channel,
  latest.last_direction,
  latest.last_status,
  latest.last_event_at,
  CASE
    WHEN latest.primary_channel IN ('sms', 'email') AND latest.last_direction = 'inbound' THEN 1
    ELSE 0
  END,
  latest.primary_channel IN ('sms', 'email') AND latest.last_direction = 'inbound',
  NOW(),
  NOW()
FROM latest_events latest
ON CONFLICT (owner_user_id, thread_key) DO UPDATE
SET property_id = COALESCE(EXCLUDED.property_id, public.communication_threads.property_id),
    contact_id = COALESCE(EXCLUDED.contact_id, public.communication_threads.contact_id),
    campaign_id = COALESCE(EXCLUDED.campaign_id, public.communication_threads.campaign_id),
    primary_channel = CASE
      WHEN EXCLUDED.last_event_at >= public.communication_threads.last_event_at THEN EXCLUDED.primary_channel
      ELSE public.communication_threads.primary_channel
    END,
    last_direction = CASE
      WHEN EXCLUDED.last_event_at >= public.communication_threads.last_event_at THEN EXCLUDED.last_direction
      ELSE public.communication_threads.last_direction
    END,
    last_status = CASE
      WHEN EXCLUDED.last_event_at >= public.communication_threads.last_event_at THEN EXCLUDED.last_status
      ELSE public.communication_threads.last_status
    END,
    last_event_at = GREATEST(public.communication_threads.last_event_at, EXCLUDED.last_event_at),
    unread_count = GREATEST(public.communication_threads.unread_count, EXCLUDED.unread_count),
    needs_reply = public.communication_threads.needs_reply OR EXCLUDED.needs_reply,
    updated_at = NOW();

-- Backfill SMS suppressions from inbound opt-out and opt-in keywords.
WITH suppression_events AS (
  SELECT
    COALESCE(m.user_id, upn.user_id) AS owner_user_id,
    COALESCE(m.property_id, ct.property_id) AS property_id,
    m.contact_id,
    'sms'::text AS channel,
    m.from_number AS destination,
    CASE
      WHEN upper(coalesce(m.body, '')) ~ '\m(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\M' THEN 'suppress'
      WHEN upper(coalesce(m.body, '')) ~ '\m(START|UNSTOP|YES)\M' THEN 'resolve'
      ELSE NULL
    END AS event_action,
    CASE
      WHEN upper(coalesce(m.body, '')) ~ '\m(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\M' THEN 'opt_out_keyword'
      WHEN upper(coalesce(m.body, '')) ~ '\m(START|UNSTOP|YES)\M' THEN 'opt_in_keyword'
      ELSE NULL
    END AS reason,
    'sms_keyword'::text AS source,
    m.created_at AS event_at
  FROM public.messages m
  LEFT JOIN public.user_phone_numbers upn
    ON upn.id = m.user_phone_number_id
  LEFT JOIN public.contacts ct
    ON ct.id = m.contact_id
  WHERE m.direction = 'inbound'
    AND COALESCE(m.user_id, upn.user_id) IS NOT NULL
    AND (
      upper(coalesce(m.body, '')) ~ '\m(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\M'
      OR upper(coalesce(m.body, '')) ~ '\m(START|UNSTOP|YES)\M'
    )
),
latest_suppression_events AS (
  SELECT DISTINCT ON (owner_user_id, channel, destination)
    owner_user_id,
    property_id,
    contact_id,
    channel,
    destination,
    event_action,
    reason,
    source,
    event_at
  FROM suppression_events
  ORDER BY owner_user_id, channel, destination, event_at DESC
),
suppression_bounds AS (
  SELECT
    owner_user_id,
    channel,
    destination,
    max(event_at) FILTER (WHERE event_action = 'suppress') AS suppressed_at,
    max(event_at) FILTER (WHERE event_action = 'resolve') AS resolved_at
  FROM suppression_events
  GROUP BY owner_user_id, channel, destination
)
INSERT INTO public.global_suppressions (
  id,
  owner_user_id,
  property_id,
  contact_id,
  channel,
  destination,
  reason,
  source,
  status,
  suppressed_at,
  resolved_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  latest.owner_user_id,
  latest.property_id,
  latest.contact_id,
  latest.channel,
  latest.destination,
  latest.reason,
  latest.source,
  CASE
    WHEN latest.event_action = 'resolve' THEN 'resolved'
    ELSE 'active'
  END,
  bounds.suppressed_at,
  CASE
    WHEN latest.event_action = 'resolve' THEN bounds.resolved_at
    ELSE NULL
  END,
  NOW(),
  NOW()
FROM latest_suppression_events latest
JOIN suppression_bounds bounds
  ON bounds.owner_user_id = latest.owner_user_id
 AND bounds.channel = latest.channel
 AND bounds.destination = latest.destination
ON CONFLICT (owner_user_id, channel, destination) DO UPDATE
SET property_id = COALESCE(EXCLUDED.property_id, public.global_suppressions.property_id),
    contact_id = COALESCE(EXCLUDED.contact_id, public.global_suppressions.contact_id),
    reason = EXCLUDED.reason,
    source = EXCLUDED.source,
    status = EXCLUDED.status,
    suppressed_at = EXCLUDED.suppressed_at,
    resolved_at = EXCLUDED.resolved_at,
    updated_at = NOW();
