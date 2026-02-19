-- Fix: Resume upload fails with "new row violates row-level security policy"
--
-- The storage.objects policy from 031 and table policies from 026 used
-- current_setting('request.jwt.claims')::jsonb which is unreliable — the
-- Storage API doesn't always set this GUC, causing the cast to fail and the
-- policy to evaluate to false. Replace with auth.role() which is the standard
-- Supabase approach (matching 040_security_advisor_hardening).

-- 1. Fix storage.objects policy (this is the immediate cause of the upload error)
drop policy if exists "service_role_manage_resumes" on storage.objects;
create policy "service_role_manage_resumes"
  on storage.objects for all
  using (bucket_id = 'resumes' and auth.role() = 'service_role')
  with check (bucket_id = 'resumes' and auth.role() = 'service_role');

-- 2. Fix job_seeker_documents policy (same fragile pattern from 026)
drop policy if exists "service_role full access on job_seeker_documents" on public.job_seeker_documents;
create policy "service_role full access on job_seeker_documents"
  on public.job_seeker_documents for all
  using (auth.role() = 'service_role');

-- 3. Fix job_seeker_references policy (same pattern from 026)
drop policy if exists "service_role full access on job_seeker_references" on public.job_seeker_references;
create policy "service_role full access on job_seeker_references"
  on public.job_seeker_references for all
  using (auth.role() = 'service_role');

-- 4. Fix job_seeker_answers policy (same pattern from 026)
drop policy if exists "service_role full access on job_seeker_answers" on public.job_seeker_answers;
create policy "service_role full access on job_seeker_answers"
  on public.job_seeker_answers for all
  using (auth.role() = 'service_role');
