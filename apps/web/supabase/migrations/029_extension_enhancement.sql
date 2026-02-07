-- 029_extension_enhancement.sql
-- Adds extension scraping support: AM tracking on jobs, contact scraping fields

-- Track which AM scraped each job post
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS scraped_by_am_id uuid REFERENCES account_managers(id);
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'manual';
  -- Values: 'extension_scrape', 'discovery', 'manual'

-- Indexes for global jobs browsing
CREATE INDEX IF NOT EXISTS job_posts_source_type_idx ON job_posts(source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS job_posts_scraped_by_idx ON job_posts(scraped_by_am_id) WHERE scraped_by_am_id IS NOT NULL;

-- Add fields to outreach_contacts for extension scraping
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS scraped_by_am_id uuid REFERENCES account_managers(id);

-- Index for contacts scraped by AM
CREATE INDEX IF NOT EXISTS outreach_contacts_scraped_by_idx ON outreach_contacts(scraped_by_am_id) WHERE scraped_by_am_id IS NOT NULL;
