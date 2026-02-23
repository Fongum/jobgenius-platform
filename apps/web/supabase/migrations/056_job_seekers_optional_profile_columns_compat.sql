-- Compatibility migration: ensure optional job_seekers profile columns exist.
-- Some environments skipped earlier migrations, which can break newer resume flows.
ALTER TABLE public.job_seekers
  ADD COLUMN IF NOT EXISTS resume_template_id TEXT DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS resume_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS work_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS preferred_industries TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS target_titles TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS seniority TEXT;
