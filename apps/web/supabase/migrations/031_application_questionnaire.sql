-- Migration: Comprehensive Application Questionnaire Fields
-- Adds all fields needed for auto-filling job applications

-- ============================================================================
-- JOB PREFERENCES (multi-select where applicable)
-- ============================================================================

-- Work type preferences (can select multiple: remote, hybrid, onsite)
alter table public.job_seekers
  add column if not exists work_type_preferences text[] default '{}';

-- Preferred job titles (already exists as target_titles)
-- Preferred locations (already exists as preferred_locations)

-- Employment type preferences (full-time, part-time, contract, internship, temporary)
alter table public.job_seekers
  add column if not exists employment_type_preferences text[] default '{}';

-- ============================================================================
-- WORK AUTHORIZATION
-- ============================================================================
alter table public.job_seekers
  add column if not exists authorized_to_work boolean;

alter table public.job_seekers
  add column if not exists visa_status text;

alter table public.job_seekers
  add column if not exists citizenship_status text;

alter table public.job_seekers
  add column if not exists requires_h1b_transfer boolean;

alter table public.job_seekers
  add column if not exists needs_employer_sponsorship boolean;

-- ============================================================================
-- AVAILABILITY & LOGISTICS
-- ============================================================================
alter table public.job_seekers
  add column if not exists start_date text;

alter table public.job_seekers
  add column if not exists notice_period text;

alter table public.job_seekers
  add column if not exists available_for_relocation boolean;

alter table public.job_seekers
  add column if not exists available_for_travel boolean;

alter table public.job_seekers
  add column if not exists willing_to_work_overtime boolean;

alter table public.job_seekers
  add column if not exists willing_to_work_weekends boolean;

alter table public.job_seekers
  add column if not exists preferred_shift text;

alter table public.job_seekers
  add column if not exists minimum_salary integer;

alter table public.job_seekers
  add column if not exists open_to_contract boolean;

-- ============================================================================
-- EEO QUESTIONS (all optional)
-- ============================================================================
alter table public.job_seekers
  add column if not exists eeo_gender text;

alter table public.job_seekers
  add column if not exists eeo_race text;

alter table public.job_seekers
  add column if not exists eeo_veteran_status text;

alter table public.job_seekers
  add column if not exists eeo_disability_status text;

-- ============================================================================
-- BACKGROUND & LEGAL
-- ============================================================================
alter table public.job_seekers
  add column if not exists felony_conviction boolean;

alter table public.job_seekers
  add column if not exists non_compete_subject boolean;

alter table public.job_seekers
  add column if not exists consent_background_check boolean;

alter table public.job_seekers
  add column if not exists consent_drug_screening boolean;

-- ============================================================================
-- RESUME STORAGE
-- ============================================================================
alter table public.job_seekers
  add column if not exists resume_url text;

alter table public.job_seekers
  add column if not exists profile_photo_url text;

-- ============================================================================
-- COMMENTS
-- ============================================================================
comment on column public.job_seekers.work_type_preferences is 'Multi-select: remote, hybrid, onsite';
comment on column public.job_seekers.employment_type_preferences is 'Multi-select: full-time, part-time, contract, internship, temporary';
comment on column public.job_seekers.visa_status is 'US citizen, Green Card, H1B, OPT, EAD, etc.';
comment on column public.job_seekers.citizenship_status is 'US Citizen, Permanent Resident, Work Visa, etc.';
comment on column public.job_seekers.preferred_shift is 'day, evening, night, flexible';
comment on column public.job_seekers.eeo_gender is 'Male, Female, Non-binary, Prefer not to say';
comment on column public.job_seekers.eeo_race is 'Race/ethnicity per EEO categories';
comment on column public.job_seekers.eeo_veteran_status is 'Not a veteran, Protected veteran, Prefer not to say';
comment on column public.job_seekers.eeo_disability_status is 'Yes, No, Prefer not to say';

-- ============================================================================
-- STORAGE POLICIES for resumes bucket
-- ============================================================================
-- Allow service role to manage all files
create policy "service_role_manage_resumes"
  on storage.objects for all
  using (bucket_id = 'resumes' and (select current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role')
  with check (bucket_id = 'resumes' and (select current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
