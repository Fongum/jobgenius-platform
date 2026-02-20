-- Add template preference to job_seekers (per-seeker, not per-resume)
ALTER TABLE public.job_seekers
  ADD COLUMN IF NOT EXISTS resume_template_id TEXT DEFAULT 'classic';

-- Add structured data and template ID to tailored_resumes
ALTER TABLE public.tailored_resumes
  ADD COLUMN IF NOT EXISTS tailored_data JSONB,
  ADD COLUMN IF NOT EXISTS template_id TEXT DEFAULT 'classic';
