-- Create calls table for voice activity
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,

  twilio_call_sid TEXT UNIQUE,
  from_number TEXT,
  to_number TEXT,
  status TEXT,
  duration INTEGER,
  notes TEXT,

  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_calls_caller_id
  ON public.calls(caller_id);

CREATE INDEX IF NOT EXISTS idx_calls_property_id
  ON public.calls(property_id);

CREATE INDEX IF NOT EXISTS idx_calls_contact_id
  ON public.calls(contact_id);

CREATE INDEX IF NOT EXISTS idx_calls_created_at
  ON public.calls(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_twilio_call_sid
  ON public.calls(twilio_call_sid);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own calls" ON public.calls;
DROP POLICY IF EXISTS "Users can insert their own calls" ON public.calls;
DROP POLICY IF EXISTS "Users can update their own calls" ON public.calls;

CREATE POLICY "Users can view their own calls"
  ON public.calls
  FOR SELECT
  USING (auth.uid() = caller_id);

CREATE POLICY "Users can insert their own calls"
  ON public.calls
  FOR INSERT
  WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Users can update their own calls"
  ON public.calls
  FOR UPDATE
  USING (auth.uid() = caller_id);
