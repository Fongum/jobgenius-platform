-- Migration 032: Add location_preferences JSONB column to job_seekers
-- Allows linking work types to specific locations, e.g.:
-- [{"work_type": "remote", "locations": ["Anywhere in USA"]},
--  {"work_type": "hybrid", "locations": ["Houston, TX", "Dallas, TX"]}]

ALTER TABLE job_seekers
ADD COLUMN IF NOT EXISTS location_preferences jsonb DEFAULT '[]';

-- GIN index for efficient JSONB querying
CREATE INDEX IF NOT EXISTS idx_job_seekers_location_preferences
ON job_seekers USING GIN (location_preferences);
