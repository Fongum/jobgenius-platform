-- ============================================================
-- Migration 048: Billing & Contracts System
-- ============================================================

-- ─── Enums ──────────────────────────────────────────────────

CREATE TYPE plan_type AS ENUM ('essentials', 'premium');
CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'complete', 'overdue');
CREATE TYPE payment_method_type AS ENUM ('bank', 'cashapp', 'zelle', 'paypal');
CREATE TYPE payment_request_status AS ENUM ('pending', 'details_sent', 'screenshot_uploaded', 'acknowledged');
CREATE TYPE commission_status AS ENUM ('pending', 'partial', 'paid', 'overdue', 'legal');
CREATE TYPE offer_status AS ENUM ('reported', 'confirmed', 'accepted');
CREATE TYPE installment_status AS ENUM ('pending', 'paid', 'overdue');
CREATE TYPE escalation_reason AS ENUM ('missed_interviews', 'no_offer_25_interviews');
CREATE TYPE escalation_decision AS ENUM ('cleared', 'terminated');

-- ─── job_seeker_contracts ────────────────────────────────────

CREATE TABLE job_seeker_contracts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id    UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  plan_type        plan_type NOT NULL,
  registration_fee NUMERIC(10,2) NOT NULL,
  commission_rate  NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  contract_html    TEXT,
  agreed_at        TIMESTAMPTZ,
  agreed_ip        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── registration_payments ───────────────────────────────────

CREATE TABLE registration_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id     UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  contract_id       UUID REFERENCES job_seeker_contracts(id),
  total_amount      NUMERIC(10,2) NOT NULL,
  amount_paid       NUMERIC(10,2) NOT NULL DEFAULT 0,
  status            payment_status NOT NULL DEFAULT 'pending',
  payment_deadline  TIMESTAMPTZ,   -- 2 weeks from first payment
  work_started      BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── payment_installments ────────────────────────────────────

CREATE TABLE payment_installments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_payment_id UUID NOT NULL REFERENCES registration_payments(id) ON DELETE CASCADE,
  job_seeker_id         UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  installment_number    INT NOT NULL CHECK (installment_number BETWEEN 1 AND 3),
  amount                NUMERIC(10,2) NOT NULL,
  proposed_date         DATE NOT NULL,
  status                installment_status NOT NULL DEFAULT 'pending',
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── payment_method_settings ─────────────────────────────────

CREATE TABLE payment_method_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method       payment_method_type NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  details      TEXT NOT NULL DEFAULT '',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  updated_by   UUID REFERENCES job_seekers(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default methods
INSERT INTO payment_method_settings (method, display_name, details, is_active) VALUES
  ('bank',     'Bank Transfer', 'Bank: [Bank Name]\nAccount Name: JobGenius LLC\nAccount #: [Account Number]\nRouting #: [Routing Number]', true),
  ('cashapp',  'CashApp',       '$Cashtag: $JobGenius\nName: JobGenius LLC', true),
  ('zelle',    'Zelle',         'Email: payments@jobgenius.com\nName: JobGenius LLC', true),
  ('paypal',   'PayPal',        'PayPal.me/JobGenius\nEmail: payments@jobgenius.com', true);

-- ─── payment_requests ────────────────────────────────────────

CREATE TABLE payment_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id         UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  installment_id        UUID REFERENCES payment_installments(id),
  offer_id              UUID, -- FK added after job_offers table created
  method                payment_method_type NOT NULL,
  status                payment_request_status NOT NULL DEFAULT 'pending',
  details_sent_at       TIMESTAMPTZ,
  details_sent_by       UUID,
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── payment_screenshots ─────────────────────────────────────

CREATE TABLE payment_screenshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id     UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  payment_request_id UUID REFERENCES payment_requests(id),
  installment_id    UUID REFERENCES payment_installments(id),
  offer_id          UUID, -- FK added after job_offers table created
  file_url          TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID,
  note              TEXT
);

-- ─── job_offers ──────────────────────────────────────────────

CREATE TABLE job_offers (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id                UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  company                      TEXT NOT NULL,
  role                         TEXT NOT NULL,
  base_salary                  NUMERIC(12,2) NOT NULL,
  reported_by                  TEXT NOT NULL CHECK (reported_by IN ('am', 'job_seeker')),
  reported_by_user_id          UUID,
  offer_accepted_at            DATE,
  start_date                   DATE,
  status                       offer_status NOT NULL DEFAULT 'reported',
  seeker_confirmed_at          TIMESTAMPTZ,
  am_confirmed_at              TIMESTAMPTZ,
  commission_amount            NUMERIC(12,2),
  commission_due_date          DATE,
  commission_extended_due_date DATE,
  commission_status            commission_status NOT NULL DEFAULT 'pending',
  extension_granted            BOOLEAN NOT NULL DEFAULT false,
  notes                        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── commission_payments ─────────────────────────────────────

CREATE TABLE commission_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  offer_id      UUID NOT NULL REFERENCES job_offers(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL,
  paid_at       TIMESTAMPTZ,
  method        payment_method_type,
  screenshot_id UUID REFERENCES payment_screenshots(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── termination_escalations ─────────────────────────────────

CREATE TABLE termination_escalations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_seeker_id   UUID NOT NULL REFERENCES job_seekers(id) ON DELETE CASCADE,
  escalated_by    UUID NOT NULL,
  reason          escalation_reason NOT NULL,
  context_notes   TEXT,
  decision        escalation_decision,
  decision_by     UUID,
  decision_at     TIMESTAMPTZ,
  decision_notes  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Add FK for offer_id back-refs ───────────────────────────

ALTER TABLE payment_requests
  ADD CONSTRAINT payment_requests_offer_id_fkey
  FOREIGN KEY (offer_id) REFERENCES job_offers(id) ON DELETE SET NULL;

ALTER TABLE payment_screenshots
  ADD CONSTRAINT payment_screenshots_offer_id_fkey
  FOREIGN KEY (offer_id) REFERENCES job_offers(id) ON DELETE SET NULL;

-- ─── Alter job_seekers ────────────────────────────────────────

ALTER TABLE job_seekers
  ADD COLUMN IF NOT EXISTS plan_type   plan_type,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES job_seeker_contracts(id);

-- ─── Indexes ──────────────────────────────────────────────────

CREATE INDEX idx_contracts_seeker       ON job_seeker_contracts(job_seeker_id);
CREATE INDEX idx_reg_payments_seeker    ON registration_payments(job_seeker_id);
CREATE INDEX idx_installments_reg       ON payment_installments(registration_payment_id);
CREATE INDEX idx_installments_seeker    ON payment_installments(job_seeker_id);
CREATE INDEX idx_pay_requests_seeker    ON payment_requests(job_seeker_id);
CREATE INDEX idx_pay_requests_status    ON payment_requests(status);
CREATE INDEX idx_pay_screenshots_seeker ON payment_screenshots(job_seeker_id);
CREATE INDEX idx_job_offers_seeker      ON job_offers(job_seeker_id);
CREATE INDEX idx_job_offers_status      ON job_offers(commission_status);
CREATE INDEX idx_commission_payments_offer ON commission_payments(offer_id);
CREATE INDEX idx_escalations_seeker     ON termination_escalations(job_seeker_id);

-- ─── Updated_at trigger helper ────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON job_seeker_contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reg_payments_updated_at
  BEFORE UPDATE ON registration_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_installments_updated_at
  BEFORE UPDATE ON payment_installments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pay_requests_updated_at
  BEFORE UPDATE ON payment_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_job_offers_updated_at
  BEFORE UPDATE ON job_offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_commission_payments_updated_at
  BEFORE UPDATE ON commission_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_escalations_updated_at
  BEFORE UPDATE ON termination_escalations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pay_method_settings_updated_at
  BEFORE UPDATE ON payment_method_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS Policies ─────────────────────────────────────────────

ALTER TABLE job_seeker_contracts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_installments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_screenshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_offers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE termination_escalations   ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (all API routes use supabaseAdmin)
CREATE POLICY "service_role_all_contracts"      ON job_seeker_contracts      FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_reg_payments"   ON registration_payments     FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_installments"   ON payment_installments      FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_pay_settings"   ON payment_method_settings   FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_pay_requests"   ON payment_requests          FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_screenshots"    ON payment_screenshots       FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_job_offers"     ON job_offers                FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_comm_payments"  ON commission_payments       FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_escalations"    ON termination_escalations   FOR ALL USING (auth.role() = 'service_role');

-- ─── Storage Bucket ───────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-screenshots',
  'payment-screenshots',
  false,
  10485760,  -- 10MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Service role storage policy
CREATE POLICY "service_role_storage_payment_screenshots"
  ON storage.objects FOR ALL
  USING (bucket_id = 'payment-screenshots' AND auth.role() = 'service_role');
