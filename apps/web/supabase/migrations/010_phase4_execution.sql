alter table public.job_seekers
  add column if not exists resume_url text;

alter table public.apply_run_events
  add column if not exists actor text not null default 'SYSTEM';

create table if not exists public.company_info (
  id uuid primary key default gen_random_uuid(),
  company_website text not null,
  emails jsonb not null default '[]'::jsonb,
  pages_visited text[] default '{}',
  scraped_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists company_info_website_idx
  on public.company_info (company_website);

create table if not exists public.apply_outbox (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid references public.job_seekers(id) on delete cascade,
  job_post_id uuid references public.job_posts(id) on delete cascade,
  draft_id uuid references public.outreach_drafts(id) on delete set null,
  provider text not null,
  status text not null default 'PENDING',
  request_payload jsonb default '{}'::jsonb,
  response_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  sent_at timestamptz
);

create index if not exists apply_outbox_job_seeker_status_idx
  on public.apply_outbox (job_seeker_id, status);

alter table public.company_info enable row level security;
alter table public.apply_outbox enable row level security;

create policy "am_select_company_info"
  on public.company_info
  for select
  using (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_company_info"
  on public.company_info
  for insert
  with check (
    exists (
      select 1 from public.account_managers
      where email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_select_apply_outbox"
  on public.apply_outbox
  for select
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = apply_outbox.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_insert_apply_outbox"
  on public.apply_outbox
  for insert
  with check (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = apply_outbox.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create policy "am_update_apply_outbox"
  on public.apply_outbox
  for update
  using (
    exists (
      select 1
      from public.job_seeker_assignments assignments
      join public.account_managers am on am.id = assignments.account_manager_id
      where assignments.job_seeker_id = apply_outbox.job_seeker_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );
