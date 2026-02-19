-- Migration: Multi-Source Job Discovery
-- Adds source_type and adapter_config to job_sources, seeds new API/feed sources

-- Add source_type to distinguish scraper vs api vs feed sources
ALTER TABLE job_sources ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'scraper';

-- Add config column for adapter-specific settings (separate from CSS selectors)
ALTER TABLE job_sources ADD COLUMN IF NOT EXISTS adapter_config JSONB DEFAULT '{}'::jsonb;

-- Update existing sources to have explicit source_type
UPDATE job_sources SET source_type = 'scraper' WHERE name IN ('linkedin', 'indeed', 'glassdoor') AND source_type IS NULL;

-- Seed new sources
INSERT INTO job_sources (name, base_url, source_type, rate_limit_per_minute, adapter_config, selectors) VALUES
  ('adzuna', 'https://api.adzuna.com/v1/api/jobs', 'api', 15, '{"country":"us"}', '{}'),
  ('remotive', 'https://remotive.com/api/remote-jobs', 'api', 30, '{}', '{}'),
  ('themuse', 'https://www.themuse.com/api/public/jobs', 'api', 20, '{}', '{}'),
  ('arbeitnow', 'https://www.arbeitnow.com/api/job-board-api', 'api', 30, '{}', '{}'),
  ('greenhouse', 'https://boards-api.greenhouse.io/v1/boards', 'feed', 30, '{}', '{}'),
  ('lever', 'https://api.lever.co/v0/postings', 'feed', 30, '{}', '{}'),
  ('ashby', 'https://jobs.ashbyhq.com/api/non-user-graphql', 'feed', 20, '{}', '{}'),
  ('hn-hiring', 'https://hn.algolia.com/api/v1', 'api', 10, '{}', '{}')
ON CONFLICT (name) DO NOTHING;
