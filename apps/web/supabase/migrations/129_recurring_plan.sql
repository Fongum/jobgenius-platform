-- ============================================================
-- Migration 129: Recurring plan ($150/month, 3.5% success fee)
--
-- Adds a third campaign tier to the AM-managed path (job_seekers.campaign_tier
-- + the Client Collaboration Agreement). Recurring has no setup fee; it is a
-- monthly subscription that the client can stop at any time. Payment happens
-- out-of-band like the setup fee: AMs record each month as paid.
--
-- Also snapshots the success-fee rate onto job_offers so the fee for an
-- accepted offer is computed with the rate the client actually signed
-- (5% Essentials/Premium, 3.5% Recurring).
-- ============================================================

-- 1. Allow the new tier ------------------------------------------------------
ALTER TABLE job_seekers DROP CONSTRAINT IF EXISTS job_seekers_campaign_tier_check;
ALTER TABLE job_seekers
  ADD CONSTRAINT job_seekers_campaign_tier_check
    CHECK (campaign_tier IN ('essentials', 'premium', 'recurring'));

-- 2. Subscription state on the seeker ----------------------------------------
ALTER TABLE job_seekers
  ADD COLUMN IF NOT EXISTS monthly_fee_usd NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_cancelled_by UUID;

-- Snapshot the monthly fee onto the signed agreement (same rationale as
-- setup_fee_usd / commission_rate in migration 111).
ALTER TABLE client_agreements
  ADD COLUMN IF NOT EXISTS monthly_fee_usd NUMERIC(10,2);

-- 3. Monthly payments ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id  UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  period_start   DATE NOT NULL,
  amount_usd     NUMERIC(10,2) NOT NULL CHECK (amount_usd >= 0),
  paid_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  marked_by      UUID,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_seeker_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_seeker
  ON subscription_payments(job_seeker_id, period_start DESC);

-- Server-only: reached through service-role API routes, never PostgREST clients.
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON subscription_payments FROM anon, authenticated;
GRANT ALL ON subscription_payments TO service_role;

-- 4. Rate snapshot on offers --------------------------------------------------
ALTER TABLE job_offers
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4);
