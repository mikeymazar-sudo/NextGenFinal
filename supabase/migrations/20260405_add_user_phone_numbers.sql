CREATE TABLE IF NOT EXISTS public.user_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT UNIQUE,
  provider TEXT NOT NULL DEFAULT 'signalwire',
  signalwire_incoming_phone_number_sid TEXT UNIQUE,
  signalwire_subscriber_id TEXT,
  signalwire_address_id TEXT UNIQUE,
  provisioning_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (provisioning_status IN ('pending', 'provisioning', 'active', 'failed', 'released')),
  voice_routing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (voice_routing_status IN ('pending', 'active', 'failed')),
  assignment_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (assignment_source IN ('auto', 'manual')),
  friendly_name TEXT,
  provisioning_error TEXT,
  voice_routing_error TEXT,
  assigned_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  last_provisioning_attempt_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_phone_numbers_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_phone_numbers_phone_number
  ON public.user_phone_numbers(phone_number);

CREATE INDEX IF NOT EXISTS idx_user_phone_numbers_status
  ON public.user_phone_numbers(provisioning_status, voice_routing_status);

CREATE OR REPLACE FUNCTION update_user_phone_numbers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_phone_numbers_updated_at_trigger ON public.user_phone_numbers;

CREATE TRIGGER user_phone_numbers_updated_at_trigger
  BEFORE UPDATE ON public.user_phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_user_phone_numbers_updated_at();

ALTER TABLE public.user_phone_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own phone numbers" ON public.user_phone_numbers;

CREATE POLICY "Users can view their own phone numbers"
  ON public.user_phone_numbers
  FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_phone_number_id UUID REFERENCES public.user_phone_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_phone_number_id ON public.messages(user_phone_number_id);

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS user_phone_number_id UUID REFERENCES public.user_phone_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_user_phone_number_id ON public.calls(user_phone_number_id);

DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;

CREATE POLICY "Users can view their own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() = user_id);
