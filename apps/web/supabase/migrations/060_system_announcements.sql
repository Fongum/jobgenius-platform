-- Migration 060: System Announcements (Superadmin Broadcast Messaging)
-- Allows superadmins to send messages to all job seekers, all AMs, or everyone.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. system_announcements  — one row per broadcast
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by_id       UUID        NOT NULL REFERENCES public.account_managers(id),
  subject          TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  -- Who receives the announcement
  target_audience  TEXT        NOT NULL
    CHECK (target_audience IN ('all_job_seekers', 'all_account_managers', 'all_users')),
  -- Whether an email was dispatched in addition to in-app display
  send_email       BOOLEAN     NOT NULL DEFAULT true,
  -- Filled in after send completes
  recipient_count  INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  error_detail     TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sa_sent_at
  ON public.system_announcements (sent_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_sa_status
  ON public.system_announcements (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. announcement_reads  — tracks who has dismissed/read each announcement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id  UUID        NOT NULL
    REFERENCES public.system_announcements(id) ON DELETE CASCADE,
  -- 'job_seeker' or 'account_manager'
  reader_type      TEXT        NOT NULL
    CHECK (reader_type IN ('job_seeker', 'account_manager')),
  -- References job_seekers.id or account_managers.id depending on reader_type
  reader_id        UUID        NOT NULL,
  read_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_announcement_reader UNIQUE (announcement_id, reader_id)
);

CREATE INDEX IF NOT EXISTS idx_ar_announcement_id
  ON public.announcement_reads (announcement_id);

CREATE INDEX IF NOT EXISTS idx_ar_reader
  ON public.announcement_reads (reader_type, reader_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.system_announcements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads    ENABLE ROW LEVEL SECURITY;

-- Service role: unrestricted
CREATE POLICY "service_role_sa_all"
  ON public.system_announcements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_ar_all"
  ON public.announcement_reads FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated AMs can read announcements (for display on dashboard)
CREATE POLICY "am_read_announcements"
  ON public.system_announcements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_managers am
      WHERE am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

-- AMs can insert their own read records
CREATE POLICY "am_insert_read"
  ON public.announcement_reads FOR INSERT
  WITH CHECK (
    reader_type = 'account_manager' AND
    EXISTS (
      SELECT 1 FROM public.account_managers am
      WHERE am.id = reader_id
        AND am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );
