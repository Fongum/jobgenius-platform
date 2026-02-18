-- Gmail Integration: OAuth connections + inbound email processing
-- Enables: outreach from seeker's Gmail, verification code extraction, inbox scanning

-- Seeker email connections (OAuth tokens)
CREATE TABLE IF NOT EXISTS public.seeker_email_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gmail',
  email_address text NOT NULL,
  access_token_enc text NOT NULL,
  refresh_token_enc text NOT NULL,
  token_expires_at timestamptz,
  scopes text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(job_seeker_id, provider)
);

CREATE INDEX idx_email_connections_seeker ON seeker_email_connections(job_seeker_id);
CREATE INDEX idx_email_connections_active ON seeker_email_connections(is_active, provider);

-- Inbound emails parsed from seeker's inbox
CREATE TABLE IF NOT EXISTS public.inbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id uuid NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.seeker_email_connections(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  thread_id text,
  from_email text NOT NULL,
  from_name text,
  to_email text,
  subject text,
  body_text text,
  body_snippet text,
  received_at timestamptz NOT NULL,
  classification text,
  classification_confidence real,
  matched_application_id uuid REFERENCES public.application_queue(id) ON DELETE SET NULL,
  matched_job_post_id uuid REFERENCES public.job_posts(id) ON DELETE SET NULL,
  extracted_data jsonb DEFAULT '{}',
  is_processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(connection_id, gmail_message_id)
);

CREATE INDEX idx_inbound_emails_seeker ON inbound_emails(job_seeker_id, received_at DESC);
CREATE INDEX idx_inbound_emails_classification ON inbound_emails(classification, is_processed);
CREATE INDEX idx_inbound_emails_connection ON inbound_emails(connection_id, received_at DESC);

-- Add gmail_email field to job_seekers for the dedicated job search email
ALTER TABLE public.job_seekers
  ADD COLUMN IF NOT EXISTS gmail_address text;

-- RLS Policies
ALTER TABLE seeker_email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seekers_manage_own_connections" ON seeker_email_connections FOR ALL
  USING (job_seeker_id IN (
    SELECT js.id FROM job_seekers js WHERE js.auth_id = auth.uid()
  ));

ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seekers_view_own_inbound" ON inbound_emails FOR SELECT
  USING (job_seeker_id IN (
    SELECT js.id FROM job_seekers js WHERE js.auth_id = auth.uid()
  ));
