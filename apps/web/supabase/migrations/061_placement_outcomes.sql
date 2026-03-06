-- Migration 061: Placement & Outcome Tracking
-- Adds interview outcome recording and seeker placement tracking

-- ── Interview outcome columns ────────────────────────────────────────────────
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT 'pending'
    CHECK (outcome IN ('pending','offer_extended','hired','rejected','ghosted','declined')),
  ADD COLUMN IF NOT EXISTS offer_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_recorded_by UUID REFERENCES account_managers(id);

-- ── Seeker placement columns ─────────────────────────────────────────────────
ALTER TABLE job_seekers
  ADD COLUMN IF NOT EXISTS placed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS placed_company TEXT,
  ADD COLUMN IF NOT EXISTS placed_role TEXT,
  ADD COLUMN IF NOT EXISTS placed_salary NUMERIC(12,2);

-- ── Index for outcome queries ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS interviews_outcome_idx ON interviews (outcome);
CREATE INDEX IF NOT EXISTS interviews_outcome_recorded_at_idx ON interviews (outcome_recorded_at);
CREATE INDEX IF NOT EXISTS job_seekers_placed_at_idx ON job_seekers (placed_at);
