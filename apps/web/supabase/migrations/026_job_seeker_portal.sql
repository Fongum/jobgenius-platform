-- 026_job_seeker_portal.sql
-- Job Seeker Portal: new tables + columns for profile, references, answers, documents, gamification

-- ============================================================
-- 1. New columns on job_seekers
-- ============================================================
alter table public.job_seekers
  add column if not exists phone text,
  add column if not exists linkedin_url text,
  add column if not exists portfolio_url text,
  add column if not exists address_line1 text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip text,
  add column if not exists address_country text,
  add column if not exists education jsonb default '[]',
  add column if not exists work_history jsonb default '[]',
  add column if not exists profile_completion int default 0,
  add column if not exists xp_points int default 0,
  add column if not exists achievements jsonb default '[]';

-- ============================================================
-- 2. job_seeker_references
-- ============================================================
create table if not exists public.job_seeker_references (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  name text not null,
  title text,
  company text,
  email text,
  phone text,
  relationship text check (relationship in ('manager', 'colleague', 'mentor', 'other')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_job_seeker_references_seeker
  on public.job_seeker_references(job_seeker_id);

-- ============================================================
-- 3. job_seeker_answers
-- ============================================================
create table if not exists public.job_seeker_answers (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  answer text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(job_seeker_id, question_key)
);

create index if not exists idx_job_seeker_answers_seeker
  on public.job_seeker_answers(job_seeker_id);

-- ============================================================
-- 4. job_seeker_documents
-- ============================================================
create table if not exists public.job_seeker_documents (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  doc_type text not null check (doc_type in ('resume', 'cover_letter', 'portfolio', 'other')),
  file_name text not null,
  file_url text not null,
  uploaded_at timestamptz default now(),
  parsed_data jsonb
);

create index if not exists idx_job_seeker_documents_seeker
  on public.job_seeker_documents(job_seeker_id);

-- ============================================================
-- 5. RLS policies
-- ============================================================

-- job_seeker_references
alter table public.job_seeker_references enable row level security;

create policy "service_role full access on job_seeker_references"
  on public.job_seeker_references for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

create policy "job seekers manage own references"
  on public.job_seeker_references for all
  using (job_seeker_id = auth.uid()::uuid)
  with check (job_seeker_id = auth.uid()::uuid);

-- job_seeker_answers
alter table public.job_seeker_answers enable row level security;

create policy "service_role full access on job_seeker_answers"
  on public.job_seeker_answers for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

create policy "job seekers manage own answers"
  on public.job_seeker_answers for all
  using (job_seeker_id = auth.uid()::uuid)
  with check (job_seeker_id = auth.uid()::uuid);

-- job_seeker_documents
alter table public.job_seeker_documents enable row level security;

create policy "service_role full access on job_seeker_documents"
  on public.job_seeker_documents for all
  using (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

create policy "job seekers manage own documents"
  on public.job_seeker_documents for all
  using (job_seeker_id = auth.uid()::uuid)
  with check (job_seeker_id = auth.uid()::uuid);

-- ============================================================
-- 6. Storage bucket for resumes (idempotent via DO block)
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('resumes', 'resumes', false)
  on conflict (id) do nothing;
