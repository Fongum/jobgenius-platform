-- ============================================================
-- 045 · Recruiter & Referral Network Hub
-- ============================================================

-- 1. network_contacts – persistent recruiter/referral directory
CREATE TABLE IF NOT EXISTS public.network_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id UUID NOT NULL REFERENCES public.account_managers(id),
  contact_type TEXT NOT NULL CHECK (contact_type IN ('recruiter', 'referral')),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  company_name TEXT,
  company_domain TEXT,
  job_title TEXT,
  industries TEXT[] DEFAULT '{}',
  notes TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'extension', 'import')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'do_not_contact')),
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. network_contact_matches – auto-matched contacts ↔ job posts
CREATE TABLE IF NOT EXISTS public.network_contact_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_contact_id UUID NOT NULL REFERENCES public.network_contacts(id) ON DELETE CASCADE,
  job_post_id UUID NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
  job_seeker_id UUID NOT NULL REFERENCES public.job_seekers(id) ON DELETE CASCADE,
  match_reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'responded', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(network_contact_id, job_post_id, job_seeker_id)
);

-- 3. network_contact_activity – outreach activity log
CREATE TABLE IF NOT EXISTS public.network_contact_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_contact_id UUID NOT NULL REFERENCES public.network_contacts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_network_contacts_am
  ON public.network_contacts(account_manager_id);
CREATE INDEX IF NOT EXISTS idx_network_contacts_company_domain
  ON public.network_contacts(company_domain);
CREATE INDEX IF NOT EXISTS idx_network_contacts_status
  ON public.network_contacts(status);

CREATE INDEX IF NOT EXISTS idx_network_contact_matches_contact
  ON public.network_contact_matches(network_contact_id);
CREATE INDEX IF NOT EXISTS idx_network_contact_matches_job_post
  ON public.network_contact_matches(job_post_id);
CREATE INDEX IF NOT EXISTS idx_network_contact_matches_seeker
  ON public.network_contact_matches(job_seeker_id);
CREATE INDEX IF NOT EXISTS idx_network_contact_matches_status
  ON public.network_contact_matches(status);

CREATE INDEX IF NOT EXISTS idx_network_contact_activity_contact
  ON public.network_contact_activity(network_contact_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_network_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_network_contacts_updated_at ON public.network_contacts;
CREATE TRIGGER trg_network_contacts_updated_at
  BEFORE UPDATE ON public.network_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_network_contacts_updated_at();

-- RLS – service_role bypass (all access via server-side supabaseAdmin)
ALTER TABLE public.network_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_contact_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_contact_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_network_contacts"
  ON public.network_contacts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_network_contact_matches"
  ON public.network_contact_matches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_network_contact_activity"
  ON public.network_contact_activity FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
