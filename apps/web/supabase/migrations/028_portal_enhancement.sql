-- Migration 028: Portal Enhancement
-- Adds conversations, application question answers, interview prep videos,
-- practice sessions, and interview results for the enhanced job seeker portal.
-- Depends on 026_job_seeker_portal.sql (profile fields, references, answers, documents).

-- ============================================================================
-- 1. ADD ADDITIONAL PROFILE FIELDS TO JOB_SEEKERS
-- ============================================================================

alter table public.job_seekers
  add column if not exists resume_url text,
  add column if not exists bio text,
  add column if not exists profile_photo_url text;

-- ============================================================================
-- 2. CONVERSATIONS
-- ============================================================================

create type public.conversation_type as enum ('general', 'application_question');

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  account_manager_id uuid not null references public.account_managers(id) on delete cascade,
  conversation_type public.conversation_type not null default 'general',
  subject text not null,
  job_post_id uuid references public.job_posts(id) on delete set null,
  application_queue_id uuid references public.application_queue(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_seeker_idx
  on public.conversations (job_seeker_id, updated_at desc);

create index if not exists conversations_am_idx
  on public.conversations (account_manager_id, updated_at desc);

create index if not exists conversations_type_idx
  on public.conversations (conversation_type);

-- ============================================================================
-- 3. CONVERSATION MESSAGES
-- ============================================================================

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('job_seeker', 'account_manager', 'system')),
  sender_id uuid not null,
  content text not null,
  is_answer boolean not null default false,
  attachments jsonb default '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_conv_idx
  on public.conversation_messages (conversation_id, created_at asc);

create index if not exists conversation_messages_unread_idx
  on public.conversation_messages (conversation_id)
  where read_at is null;

-- ============================================================================
-- 4. APPLICATION QUESTION ANSWERS (reusable on profile)
-- ============================================================================

create table if not exists public.application_question_answers (
  id uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  question text not null,
  answer text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.conversation_messages(id) on delete set null,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_question_answers_seeker_idx
  on public.application_question_answers (job_seeker_id, is_active)
  where is_active = true;

create index if not exists app_question_answers_category_idx
  on public.application_question_answers (job_seeker_id, category)
  where is_active = true;

-- ============================================================================
-- 5. INTERVIEW PREP VIDEOS
-- ============================================================================

create table if not exists public.interview_prep_videos (
  id uuid primary key default gen_random_uuid(),
  interview_prep_id uuid not null references public.interview_prep(id) on delete cascade,
  title text not null,
  url text not null,
  source text,
  thumbnail_url text,
  duration_seconds integer,
  description text,
  category text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists interview_prep_videos_prep_idx
  on public.interview_prep_videos (interview_prep_id, sort_order);

-- ============================================================================
-- 6. INTERVIEW PRACTICE SESSIONS
-- ============================================================================

create type public.practice_session_status as enum ('not_started', 'in_progress', 'completed');

create table if not exists public.interview_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  interview_prep_id uuid not null references public.interview_prep(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  session_type text not null default 'qa' check (session_type in ('qa', 'audio_simulation')),
  status public.practice_session_status not null default 'not_started',
  questions jsonb not null default '[]'::jsonb,
  audio_recording_url text,
  overall_score integer check (overall_score >= 0 and overall_score <= 100),
  feedback jsonb default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists practice_sessions_seeker_idx
  on public.interview_practice_sessions (job_seeker_id, created_at desc);

create index if not exists practice_sessions_prep_idx
  on public.interview_practice_sessions (interview_prep_id);

-- ============================================================================
-- 7. INTERVIEW RESULTS (for ranking/performance)
-- ============================================================================

create table if not exists public.interview_results (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade unique,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  outcome text not null check (outcome in ('passed', 'failed', 'pending', 'advanced', 'offer', 'rejected')),
  interviewer_feedback text,
  internal_rating integer check (internal_rating >= 1 and internal_rating <= 5),
  stage text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interview_results_seeker_idx
  on public.interview_results (job_seeker_id, created_at desc);

create index if not exists interview_results_outcome_idx
  on public.interview_results (outcome);

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

-- ---- conversations ----
alter table public.conversations enable row level security;

create policy "service_role_all_conversations"
  on public.conversations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "job_seeker_select_own_conversations"
  on public.conversations for select
  using (job_seeker_id in (
    select id from public.job_seekers where auth_id = auth.uid()
  ));

create policy "am_manage_assigned_conversations"
  on public.conversations for all
  using (
    account_manager_id in (
      select id from public.account_managers where auth_id = auth.uid()
    )
  )
  with check (
    account_manager_id in (
      select id from public.account_managers where auth_id = auth.uid()
    )
  );

-- ---- conversation_messages ----
alter table public.conversation_messages enable row level security;

create policy "service_role_all_conversation_messages"
  on public.conversation_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "job_seeker_select_own_messages"
  on public.conversation_messages for select
  using (conversation_id in (
    select c.id from public.conversations c
    join public.job_seekers js on js.id = c.job_seeker_id
    where js.auth_id = auth.uid()
  ));

create policy "job_seeker_insert_own_messages"
  on public.conversation_messages for insert
  with check (conversation_id in (
    select c.id from public.conversations c
    join public.job_seekers js on js.id = c.job_seeker_id
    where js.auth_id = auth.uid()
  ));

create policy "job_seeker_update_own_messages"
  on public.conversation_messages for update
  using (conversation_id in (
    select c.id from public.conversations c
    join public.job_seekers js on js.id = c.job_seeker_id
    where js.auth_id = auth.uid()
  ));

create policy "am_manage_assigned_messages"
  on public.conversation_messages for all
  using (conversation_id in (
    select c.id from public.conversations c
    join public.account_managers am on am.id = c.account_manager_id
    where am.auth_id = auth.uid()
  ))
  with check (conversation_id in (
    select c.id from public.conversations c
    join public.account_managers am on am.id = c.account_manager_id
    where am.auth_id = auth.uid()
  ));

-- ---- application_question_answers ----
alter table public.application_question_answers enable row level security;

create policy "service_role_all_app_answers"
  on public.application_question_answers for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "job_seeker_manage_own_answers"
  on public.application_question_answers for all
  using (job_seeker_id in (
    select id from public.job_seekers where auth_id = auth.uid()
  ))
  with check (job_seeker_id in (
    select id from public.job_seekers where auth_id = auth.uid()
  ));

create policy "am_select_assigned_answers"
  on public.application_question_answers for select
  using (job_seeker_id in (
    select jsa.job_seeker_id from public.job_seeker_assignments jsa
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ));

-- ---- interview_prep_videos ----
alter table public.interview_prep_videos enable row level security;

create policy "service_role_all_prep_videos"
  on public.interview_prep_videos for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "job_seeker_select_own_prep_videos"
  on public.interview_prep_videos for select
  using (interview_prep_id in (
    select ip.id from public.interview_prep ip
    join public.job_seekers js on js.id = ip.job_seeker_id
    where js.auth_id = auth.uid()
  ));

create policy "am_manage_prep_videos"
  on public.interview_prep_videos for all
  using (interview_prep_id in (
    select ip.id from public.interview_prep ip
    join public.job_seeker_assignments jsa on jsa.job_seeker_id = ip.job_seeker_id
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ))
  with check (interview_prep_id in (
    select ip.id from public.interview_prep ip
    join public.job_seeker_assignments jsa on jsa.job_seeker_id = ip.job_seeker_id
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ));

-- ---- interview_practice_sessions ----
alter table public.interview_practice_sessions enable row level security;

create policy "service_role_all_practice_sessions"
  on public.interview_practice_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "job_seeker_manage_own_practice"
  on public.interview_practice_sessions for all
  using (job_seeker_id in (
    select id from public.job_seekers where auth_id = auth.uid()
  ))
  with check (job_seeker_id in (
    select id from public.job_seekers where auth_id = auth.uid()
  ));

create policy "am_select_assigned_practice"
  on public.interview_practice_sessions for select
  using (job_seeker_id in (
    select jsa.job_seeker_id from public.job_seeker_assignments jsa
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ));

-- ---- interview_results ----
alter table public.interview_results enable row level security;

create policy "service_role_all_interview_results"
  on public.interview_results for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "job_seeker_select_own_results"
  on public.interview_results for select
  using (job_seeker_id in (
    select id from public.job_seekers where auth_id = auth.uid()
  ));

create policy "am_manage_assigned_results"
  on public.interview_results for all
  using (job_seeker_id in (
    select jsa.job_seeker_id from public.job_seeker_assignments jsa
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ))
  with check (job_seeker_id in (
    select jsa.job_seeker_id from public.job_seeker_assignments jsa
    join public.account_managers am on am.id = jsa.account_manager_id
    where am.auth_id = auth.uid()
  ));

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

comment on table public.conversations is 'Conversation threads between job seekers and account managers';
comment on column public.conversations.conversation_type is 'general = info/chat, application_question = forwarded application questions';
comment on table public.conversation_messages is 'Individual messages within a conversation';
comment on column public.conversation_messages.is_answer is 'For application questions: marks the definitive answer to be saved on profile';
comment on table public.application_question_answers is 'Reusable Q&A answers stored on job seeker profile';
comment on column public.application_question_answers.category is 'e.g. work_authorization, salary_expectations, availability, experience';
comment on table public.interview_prep_videos is 'Video resources linked to interview preparation';
comment on table public.interview_practice_sessions is 'Practice Q&A and audio simulation sessions';
comment on column public.interview_practice_sessions.questions is 'JSON array of {question, expected_answer, user_answer, score}';
comment on table public.interview_results is 'Tracks interview outcomes for performance ranking';
