CREATE TABLE IF NOT EXISTS skip_trace_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  property_ids UUID[] NOT NULL,
  download_url TEXT,
  results_processed BOOLEAN DEFAULT false,
  titan_skip_count INTEGER DEFAULT 0,
  batch_data_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE skip_trace_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own skip trace jobs"
  ON skip_trace_jobs FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert own skip trace jobs"
  ON skip_trace_jobs FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE INDEX idx_skip_trace_jobs_trace_id ON skip_trace_jobs(trace_id);
CREATE INDEX idx_skip_trace_jobs_created_by ON skip_trace_jobs(created_by);
CREATE INDEX idx_skip_trace_jobs_status ON skip_trace_jobs(status);
