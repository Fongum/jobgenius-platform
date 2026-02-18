-- 040: Security advisor hardening (RLS + view invoker + function search_path)

-- Views should respect RLS of the caller
alter view public.attention_inbox set (security_invoker = true);
alter view public.apply_runs set (security_invoker = true);
alter view public.apply_queue_ready set (security_invoker = true);
alter view public.v_ops_kpis_hourly set (security_invoker = true);

-- RLS for internal tables (service role only)
alter table public.saved_jobs enable row level security;
drop policy if exists "service_role_all_saved_jobs" on public.saved_jobs;
create policy "service_role_all_saved_jobs"
  on public.saved_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.ops_alerts enable row level security;
drop policy if exists "service_role_all_ops_alerts" on public.ops_alerts;
create policy "service_role_all_ops_alerts"
  on public.ops_alerts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.runner_heartbeats enable row level security;
drop policy if exists "service_role_all_runner_heartbeats" on public.runner_heartbeats;
create policy "service_role_all_runner_heartbeats"
  on public.runner_heartbeats
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.jobseeker_consents enable row level security;
drop policy if exists "service_role_all_jobseeker_consents" on public.jobseeker_consents;
create policy "service_role_all_jobseeker_consents"
  on public.jobseeker_consents
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.tailored_resumes enable row level security;
drop policy if exists "service_role_all_tailored_resumes" on public.tailored_resumes;
create policy "service_role_all_tailored_resumes"
  on public.tailored_resumes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Background job and auth support tables (service role only)
alter table public.background_jobs enable row level security;
drop policy if exists "service_role_all_background_jobs" on public.background_jobs;
create policy "service_role_all_background_jobs"
  on public.background_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.auth_sessions enable row level security;
drop policy if exists "service_role_all_auth_sessions" on public.auth_sessions;
create policy "service_role_all_auth_sessions"
  on public.auth_sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.password_reset_tokens enable row level security;
drop policy if exists "service_role_all_password_reset_tokens" on public.password_reset_tokens;
create policy "service_role_all_password_reset_tokens"
  on public.password_reset_tokens
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Ensure account_managers RLS is enabled
alter table public.account_managers enable row level security;

-- Function search_path hardening
alter function public.cleanup_runner_heartbeats(integer)
  set search_path = public, extensions;

alter function public.cleanup_apply_run_events(integer)
  set search_path = public, extensions;

alter function public.cleanup_ops_alerts(integer)
  set search_path = public, extensions;

alter function public.get_user_from_auth()
  set search_path = public, auth, extensions;

alter function public.generate_am_code()
  set search_path = public, extensions;

alter function public.set_am_code()
  set search_path = public, extensions;

alter function public.book_interview_slot(uuid, uuid)
  set search_path = public, extensions;
