-- 057_voice_calls_core.sql
-- Core schema for Bland voice automation, lead intake, and call audit trails.

create table if not exists public.voice_playbooks (
  id uuid primary key default gen_random_uuid(),
  call_type text not null check (
    call_type in (
      'lead_qualification',
      'onboarding',
      'follow_up',
      'discovery',
      'check_in',
      'interview_prep',
      'upsell_retention'
    )
  ),
  name text not null,
  is_active boolean not null default true,
  pathway_id text,
  system_prompt text not null,
  assistant_goal text,
  guardrails text,
  escalation_rules jsonb not null default '{}'::jsonb,
  max_retry_attempts int not null default 3 check (max_retry_attempts between 0 and 10),
  retry_backoff_minutes int not null default 120 check (retry_backoff_minutes between 1 and 1440),
  business_hours_start int not null default 9 check (business_hours_start between 0 and 23),
  business_hours_end int not null default 18 check (business_hours_end between 0 and 23),
  timezone_default text not null default 'America/New_York',
  record_calls boolean not null default true,
  retain_transcripts boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by_am_id uuid references public.account_managers(id) on delete set null,
  updated_by_am_id uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voice_playbooks_call_type_name_uidx
  on public.voice_playbooks(call_type, name);

create index if not exists voice_playbooks_active_idx
  on public.voice_playbooks(is_active, call_type);

create table if not exists public.lead_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source text not null default 'excel_import',
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  total_rows int not null default 0,
  inserted_rows int not null default 0,
  error_rows int not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by_am_id uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('signup', 'marketing_form', 'excel_import', 'manual')),
  status text not null default 'new' check (status in ('new', 'qualified', 'nurture', 'disqualified', 'converted')),
  full_name text,
  email text,
  phone text,
  location text,
  target_roles text[] not null default '{}'::text[],
  notes text,
  tags text[] not null default '{}'::text[],
  consent_voice boolean not null default false,
  consent_marketing boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  imported_batch_id uuid references public.lead_import_batches(id) on delete set null,
  imported_row_number int,
  linked_job_seeker_id uuid references public.job_seekers(id) on delete set null,
  owner_account_manager_id uuid references public.account_managers(id) on delete set null,
  last_call_at timestamptz,
  next_call_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_intake_status_due_idx
  on public.lead_intake_submissions(status, next_call_due_at);

create index if not exists lead_intake_email_idx
  on public.lead_intake_submissions(lower(email))
  where email is not null;

create index if not exists lead_intake_phone_idx
  on public.lead_intake_submissions(phone)
  where phone is not null;

create index if not exists lead_intake_linked_seeker_idx
  on public.lead_intake_submissions(linked_job_seeker_id)
  where linked_job_seeker_id is not null;

create table if not exists public.lead_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.lead_import_batches(id) on delete cascade,
  row_number int not null,
  raw_data jsonb not null default '{}'::jsonb,
  normalized_email text,
  normalized_phone text,
  status text not null default 'inserted' check (status in ('inserted', 'duplicate', 'invalid', 'error')),
  error_detail text,
  lead_submission_id uuid references public.lead_intake_submissions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_import_rows_batch_idx
  on public.lead_import_rows(batch_id, row_number);

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'bland',
  provider_call_id text,
  direction text not null check (direction in ('outbound', 'inbound')),
  call_type text not null check (
    call_type in (
      'lead_qualification',
      'onboarding',
      'follow_up',
      'discovery',
      'check_in',
      'interview_prep',
      'upsell_retention'
    )
  ),
  status text not null default 'queued' check (
    status in (
      'queued',
      'initiated',
      'ringing',
      'in_progress',
      'ended',
      'completed',
      'failed',
      'no_answer',
      'voicemail',
      'opted_out',
      'escalated',
      'cancelled'
    )
  ),
  job_seeker_id uuid references public.job_seekers(id) on delete set null,
  lead_submission_id uuid references public.lead_intake_submissions(id) on delete set null,
  account_manager_id uuid references public.account_managers(id) on delete set null,
  playbook_id uuid references public.voice_playbooks(id) on delete set null,
  from_number text,
  to_number text not null,
  contact_name text,
  language text default 'en',
  task text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  transcript text,
  recording_url text,
  summary text,
  disposition text,
  requires_escalation boolean not null default false,
  escalation_reason text,
  retry_count int not null default 0,
  max_retries int not null default 3 check (max_retries between 0 and 10),
  next_retry_at timestamptz,
  call_started_at timestamptz,
  call_ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voice_calls_provider_call_uidx
  on public.voice_calls(provider_call_id)
  where provider_call_id is not null;

create index if not exists voice_calls_status_retry_idx
  on public.voice_calls(status, next_retry_at);

create index if not exists voice_calls_job_seeker_idx
  on public.voice_calls(job_seeker_id, created_at desc)
  where job_seeker_id is not null;

create index if not exists voice_calls_lead_idx
  on public.voice_calls(lead_submission_id, created_at desc)
  where lead_submission_id is not null;

create table if not exists public.voice_call_events (
  id uuid primary key default gen_random_uuid(),
  voice_call_id uuid references public.voice_calls(id) on delete cascade,
  provider text not null default 'bland',
  provider_call_id text,
  provider_event_id text,
  event_type text not null,
  event_status text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists voice_call_events_call_idx
  on public.voice_call_events(voice_call_id, received_at desc);

create index if not exists voice_call_events_provider_call_idx
  on public.voice_call_events(provider_call_id, received_at desc)
  where provider_call_id is not null;

create table if not exists public.voice_opt_outs (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete set null,
  lead_submission_id uuid references public.lead_intake_submissions(id) on delete set null,
  phone_number text not null,
  scope text not null default 'upsell_only' check (scope in ('upsell_only', 'all_voice')),
  reason text,
  source text not null default 'user_request',
  active boolean not null default true,
  created_by_am_id uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voice_opt_outs_phone_scope_active_uidx
  on public.voice_opt_outs(phone_number, scope)
  where active = true;

create index if not exists voice_opt_outs_job_seeker_idx
  on public.voice_opt_outs(job_seeker_id)
  where job_seeker_id is not null;

create index if not exists voice_opt_outs_lead_idx
  on public.voice_opt_outs(lead_submission_id)
  where lead_submission_id is not null;

insert into public.voice_playbooks (
  call_type,
  name,
  is_active,
  system_prompt,
  assistant_goal,
  guardrails,
  escalation_rules,
  max_retry_attempts
) values
  (
    'lead_qualification',
    'Default',
    true,
    'Qualify new leads for JobGenius services, collect role goals, timeline, and readiness to proceed.',
    'Determine if the lead is qualified, nurture, or disqualified and capture clear next steps.',
    'Be concise, professional, and compliant. Do not provide legal or financial promises.',
    '{"compliance":true,"payment_hardship":true,"hostile_sentiment":true,"human_request":true}'::jsonb,
    3
  ),
  (
    'onboarding',
    'Default',
    true,
    'Guide new seekers through onboarding blockers and confirm required setup details.',
    'Increase onboarding completion and resolve blockers quickly.',
    'Use supportive language. Keep instructions simple and actionable.',
    '{"compliance":true,"payment_hardship":true,"hostile_sentiment":true,"human_request":true}'::jsonb,
    2
  ),
  (
    'follow_up',
    'Default',
    true,
    'Follow up with seekers on pending actions and clarify deadlines.',
    'Recover stalled progress and secure confirmations.',
    'Do not pressure. Offer AM handoff when requested.',
    '{"compliance":true,"payment_hardship":false,"hostile_sentiment":true,"human_request":true}'::jsonb,
    2
  ),
  (
    'discovery',
    'Default',
    true,
    'Collect additional role and market preferences to improve job discovery quality.',
    'Improve signal quality for matching and outreach.',
    'Keep discovery questions structured and avoid overlong calls.',
    '{"compliance":true,"payment_hardship":false,"hostile_sentiment":true,"human_request":true}'::jsonb,
    2
  ),
  (
    'check_in',
    'Default',
    true,
    'Run periodic progress check-ins and identify immediate blockers.',
    'Maintain momentum and detect AM handoff needs early.',
    'Respect opt-outs and keep check-ins short.',
    '{"compliance":true,"payment_hardship":true,"hostile_sentiment":true,"human_request":true}'::jsonb,
    2
  ),
  (
    'interview_prep',
    'Default',
    true,
    'Prepare seekers for upcoming interviews with concise drills and reminders.',
    'Improve confidence and interview readiness before scheduled interviews.',
    'Focus on practical coaching only. Escalate if candidate requests human coaching.',
    '{"compliance":true,"payment_hardship":false,"hostile_sentiment":true,"human_request":true}'::jsonb,
    2
  ),
  (
    'upsell_retention',
    'Default',
    true,
    'Handle retention and upsell check-ins, while honoring upsell-only opt-out preferences.',
    'Retain qualified seekers and identify support gaps.',
    'If user opts out of upsell calls, mark opt-out and stop upsell outreach immediately.',
    '{"compliance":true,"payment_hardship":true,"hostile_sentiment":true,"human_request":true}'::jsonb,
    2
  )
on conflict (call_type, name) do nothing;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_voice_playbooks_updated_at') then
    create trigger trg_voice_playbooks_updated_at
      before update on public.voice_playbooks
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_lead_import_batches_updated_at') then
    create trigger trg_lead_import_batches_updated_at
      before update on public.lead_import_batches
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_lead_intake_submissions_updated_at') then
    create trigger trg_lead_intake_submissions_updated_at
      before update on public.lead_intake_submissions
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_voice_calls_updated_at') then
    create trigger trg_voice_calls_updated_at
      before update on public.voice_calls
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_voice_opt_outs_updated_at') then
    create trigger trg_voice_opt_outs_updated_at
      before update on public.voice_opt_outs
      for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.voice_playbooks enable row level security;
drop policy if exists "service_role_all_voice_playbooks" on public.voice_playbooks;
create policy "service_role_all_voice_playbooks"
  on public.voice_playbooks
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

alter table public.lead_import_batches enable row level security;
drop policy if exists "service_role_all_lead_import_batches" on public.lead_import_batches;
create policy "service_role_all_lead_import_batches"
  on public.lead_import_batches
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

alter table public.lead_intake_submissions enable row level security;
drop policy if exists "service_role_all_lead_intake_submissions" on public.lead_intake_submissions;
create policy "service_role_all_lead_intake_submissions"
  on public.lead_intake_submissions
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

alter table public.lead_import_rows enable row level security;
drop policy if exists "service_role_all_lead_import_rows" on public.lead_import_rows;
create policy "service_role_all_lead_import_rows"
  on public.lead_import_rows
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

alter table public.voice_calls enable row level security;
drop policy if exists "service_role_all_voice_calls" on public.voice_calls;
create policy "service_role_all_voice_calls"
  on public.voice_calls
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

alter table public.voice_call_events enable row level security;
drop policy if exists "service_role_all_voice_call_events" on public.voice_call_events;
create policy "service_role_all_voice_call_events"
  on public.voice_call_events
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

alter table public.voice_opt_outs enable row level security;
drop policy if exists "service_role_all_voice_opt_outs" on public.voice_opt_outs;
create policy "service_role_all_voice_opt_outs"
  on public.voice_opt_outs
  for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role')
  with check (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');
