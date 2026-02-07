CREATE TABLE IF NOT EXISTS tailored_resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  job_post_id UUID NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  original_text TEXT,
  tailored_text TEXT NOT NULL,
  changes_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_seeker_id, job_post_id)
);
