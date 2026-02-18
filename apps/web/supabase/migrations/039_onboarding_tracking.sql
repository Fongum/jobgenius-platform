-- Add onboarding tracking to job_seekers
ALTER TABLE job_seekers ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ DEFAULT NULL;

-- Index for fast new-user detection
CREATE INDEX IF NOT EXISTS idx_job_seekers_onboarding ON job_seekers (onboarding_completed_at) WHERE onboarding_completed_at IS NULL;
