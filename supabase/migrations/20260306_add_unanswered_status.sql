-- Add 'unanswered' status and update increment_unanswered to use it

-- Drop existing CHECK constraint on status column and add updated one
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'properties'::regclass
    AND c.contype = 'c'
    AND a.attname = 'status';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE properties DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;

-- Add updated CHECK constraint that includes 'unanswered'
ALTER TABLE properties
  ADD CONSTRAINT properties_status_check
  CHECK (status IN ('new', 'unanswered', 'contacted', 'warm', 'follow_up', 'closed'));

-- Update the increment_unanswered RPC to set status = 'unanswered' for new leads
CREATE OR REPLACE FUNCTION increment_unanswered(prop_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE properties
  SET unanswered_count = COALESCE(unanswered_count, 0) + 1,
      last_called_at = now(),
      status = CASE WHEN status = 'new' THEN 'unanswered' ELSE status END,
      status_changed_at = CASE WHEN status = 'new' THEN now() ELSE status_changed_at END
  WHERE id = prop_id;
END;
$$ LANGUAGE plpgsql;
