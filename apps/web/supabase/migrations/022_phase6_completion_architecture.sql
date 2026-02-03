alter table public.recruiter_threads
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists ghosting_risk_score int not null default 0,
  add column if not exists interview_started_at timestamptz,
  add column if not exists offer_received_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists close_reason text;

alter table public.outreach_messages
  add column if not exists open_tracking_token text,
  add column if not exists follow_up_tone text;

create unique index if not exists outreach_messages_open_tracking_token_uidx
  on public.outreach_messages (open_tracking_token)
  where open_tracking_token is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiters_status_phase6_check'
  ) then
    alter table public.recruiters
      add constraint recruiters_status_phase6_check
      check (status in ('NEW', 'CONTACTED', 'ENGAGED', 'INTERVIEWING', 'CLOSED'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruiter_threads_status_phase6_check'
  ) then
    alter table public.recruiter_threads
      add constraint recruiter_threads_status_phase6_check
      check (thread_status in ('ACTIVE', 'WAITING_REPLY', 'FOLLOW_UP_DUE', 'CLOSED'))
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outreach_messages_status_phase6_check'
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_status_phase6_check
      check (
        status in (
          'DRAFTED',
          'QUEUED',
          'SENT',
          'DELIVERED',
          'OPENED',
          'REPLIED',
          'FOLLOWUP_DUE',
          'BOUNCED',
          'FAILED',
          'OPTED_OUT',
          'CLOSED'
        )
      )
      not valid;
  end if;
end $$;

alter table public.outreach_sequence_steps
  add column if not exists delay_days int,
  add column if not exists template_type text;

update public.outreach_sequence_steps
set delay_days = case
  when delay_hours <= 0 then 0
  else ceil(delay_hours::numeric / 24.0)::int
end
where delay_days is null;

update public.outreach_sequence_steps
set template_type = case
  when step_number = 1 then 'INITIAL'
  when step_number = 2 then 'FOLLOWUP_1'
  else 'FOLLOWUP_2'
end
where template_type is null;

alter table public.outreach_sequence_steps
  alter column delay_days set default 0;

alter table public.outreach_sequence_steps
  alter column template_type set default 'INITIAL';

create table if not exists public.outreach_plans (
  id uuid primary key default gen_random_uuid(),
  recruiter_thread_id uuid not null references public.recruiter_threads(id) on delete cascade unique,
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  sequence_id uuid references public.outreach_sequences(id) on delete set null,
  recruiter_type text,
  preferred_tone text not null default 'CONCISE',
  company_signal text,
  personalization jsonb not null default '{}'::jsonb,
  ghosting_risk_score int not null default 0,
  next_action text not null default 'SEND_INITIAL',
  plan_version text not null default 'v1',
  generated_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists outreach_plans_thread_idx
  on public.outreach_plans (recruiter_thread_id);

create index if not exists outreach_plans_risk_idx
  on public.outreach_plans (ghosting_risk_score, next_action);

create table if not exists public.recruiter_opt_outs (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references public.recruiters(id) on delete cascade,
  recruiter_thread_id uuid references public.recruiter_threads(id) on delete set null,
  email text,
  source text not null default 'webhook',
  reason text,
  opted_out_at timestamptz not null default now(),
  created_at timestamptz default now(),
  unique (recruiter_id)
);

create index if not exists recruiter_opt_outs_thread_idx
  on public.recruiter_opt_outs (recruiter_thread_id);

alter table public.outreach_plans enable row level security;
alter table public.recruiter_opt_outs enable row level security;

drop policy if exists "am_select_outreach_plans" on public.outreach_plans;
create policy "am_select_outreach_plans"
  on public.outreach_plans
  for select
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_plans.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_outreach_plans" on public.outreach_plans;
create policy "am_insert_outreach_plans"
  on public.outreach_plans
  for insert
  with check (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_plans.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_outreach_plans" on public.outreach_plans;
create policy "am_update_outreach_plans"
  on public.outreach_plans
  for update
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.id = outreach_plans.recruiter_thread_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_select_recruiter_opt_outs" on public.recruiter_opt_outs;
create policy "am_select_recruiter_opt_outs"
  on public.recruiter_opt_outs
  for select
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.recruiter_id = recruiter_opt_outs.recruiter_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_insert_recruiter_opt_outs" on public.recruiter_opt_outs;
create policy "am_insert_recruiter_opt_outs"
  on public.recruiter_opt_outs
  for insert
  with check (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.recruiter_id = recruiter_opt_outs.recruiter_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

drop policy if exists "am_update_recruiter_opt_outs" on public.recruiter_opt_outs;
create policy "am_update_recruiter_opt_outs"
  on public.recruiter_opt_outs
  for update
  using (
    exists (
      select 1
      from public.recruiter_threads threads
      join public.job_seeker_assignments assignments
        on assignments.job_seeker_id = threads.job_seeker_id
      join public.account_managers am
        on am.id = assignments.account_manager_id
      where threads.recruiter_id = recruiter_opt_outs.recruiter_id
        and am.email = coalesce(auth.jwt() ->> 'email', '')
    )
  );

create or replace view public.v_outreach_am_metrics as
  with thread_rollup as (
    select
      assignments.account_manager_id,
      threads.id as recruiter_thread_id,
      threads.recruiter_id,
      threads.reply_sentiment_score,
      threads.interview_started_at,
      threads.offer_received_at,
      threads.closed_at,
      threads.ghosting_risk_score,
      recruiters.status as recruiter_status,
      recruiters.last_contacted_at,
      min(messages.sent_at) filter (
        where messages.direction = 'OUTBOUND' and messages.sent_at is not null
      ) as first_outbound_sent_at,
      max(case when messages.status = 'REPLIED' then 1 else 0 end) as has_reply,
      max(case when messages.status = 'BOUNCED' then 1 else 0 end) as has_bounce
    from public.recruiter_threads threads
    join public.job_seeker_assignments assignments
      on assignments.job_seeker_id = threads.job_seeker_id
    left join public.recruiters recruiters
      on recruiters.id = threads.recruiter_id
    left join public.outreach_messages messages
      on messages.recruiter_thread_id = threads.id
    group by
      assignments.account_manager_id,
      threads.id,
      threads.recruiter_id,
      threads.reply_sentiment_score,
      threads.interview_started_at,
      threads.offer_received_at,
      threads.closed_at,
      threads.ghosting_risk_score,
      recruiters.status,
      recruiters.last_contacted_at
  )
  select
    account_manager_id,
    count(distinct recruiter_id) filter (where last_contacted_at is not null) as recruiters_contacted,
    count(*) as threads_total,
    count(*) filter (where has_reply = 1) as replied_threads,
    case
      when count(*) filter (where last_contacted_at is not null) > 0
        then round(
          (count(*) filter (where has_reply = 1))::numeric
          / nullif(count(*) filter (where last_contacted_at is not null), 0),
          3
        )
      else 0
    end as reply_rate,
    count(*) filter (
      where has_reply = 1 and coalesce(reply_sentiment_score, 0) >= 20
    ) as positive_replies,
    case
      when count(*) filter (where has_reply = 1) > 0
        then round(
          (
            count(*) filter (
              where has_reply = 1 and coalesce(reply_sentiment_score, 0) >= 20
            )
          )::numeric
          / nullif(count(*) filter (where has_reply = 1), 0),
          3
        )
      else 0
    end as positive_reply_pct,
    count(*) filter (
      where recruiter_status = 'INTERVIEWING' or interview_started_at is not null
    ) as interviewing_threads,
    case
      when count(*) filter (where last_contacted_at is not null) > 0
        then round(
          (
            count(*) filter (
              where recruiter_status = 'INTERVIEWING' or interview_started_at is not null
            )
          )::numeric
          / nullif(count(*) filter (where last_contacted_at is not null), 0),
          3
        )
      else 0
    end as interview_conversion_rate,
    count(*) filter (where offer_received_at is not null) as offer_threads,
    case
      when count(*) filter (
        where offer_received_at is not null and first_outbound_sent_at is not null
      ) > 0
      then round(
        avg(
          extract(epoch from (offer_received_at - first_outbound_sent_at)) / 3600
        ) filter (
          where offer_received_at is not null and first_outbound_sent_at is not null
        )::numeric,
        1
      )
      else null
    end as avg_hours_to_offer,
    round(avg(ghosting_risk_score)::numeric, 2) as avg_ghosting_risk
  from thread_rollup
  group by account_manager_id;

create or replace view public.v_outreach_pipeline_status as
  select
    assignments.account_manager_id,
    recruiters.status,
    count(*) as recruiter_count
  from public.recruiter_threads threads
  join public.job_seeker_assignments assignments
    on assignments.job_seeker_id = threads.job_seeker_id
  join public.recruiters recruiters
    on recruiters.id = threads.recruiter_id
  group by assignments.account_manager_id, recruiters.status;

do $$
declare
  default_sequence_id uuid;
begin
  select id
    into default_sequence_id
  from public.outreach_sequences
  where is_active = true
  order by created_at asc
  limit 1;

  if default_sequence_id is null then
    insert into public.outreach_sequences (name, is_active)
    values ('Default Recruiter Sequence', true)
    returning id into default_sequence_id;
  end if;

  insert into public.outreach_sequence_steps (
    sequence_id,
    step_number,
    delay_hours,
    delay_days,
    template_key,
    template_type,
    subject_template,
    body_template
  )
  values
    (
      default_sequence_id,
      1,
      0,
      0,
      'INITIAL',
      'INITIAL',
      'Introduction from JobGenius',
      'Hi {{recruiter_name}},\n\nI am reaching out from JobGenius with a candidate profile that aligns with your open roles.\n\nIf useful, I can share a concise summary and coordinate next steps.\n\nThanks,\nJobGenius AM'
    ),
    (
      default_sequence_id,
      2,
      72,
      3,
      'FOLLOWUP_1',
      'FOLLOWUP_1',
      'Quick follow-up',
      'Hi {{recruiter_name}},\n\nQuick follow-up in case this got buried. I can send a short candidate summary tailored to {{company_name}} hiring needs.\n\nThanks,\nJobGenius AM'
    ),
    (
      default_sequence_id,
      3,
      144,
      6,
      'FOLLOWUP_2',
      'FOLLOWUP_2',
      'Final follow-up',
      'Hi {{recruiter_name}},\n\nFinal follow-up from my side. If this is not the right contact, a quick redirect would be very helpful.\n\nBest,\nJobGenius AM'
    )
  on conflict (sequence_id, step_number)
  do update set
    delay_hours = excluded.delay_hours,
    delay_days = excluded.delay_days,
    template_key = excluded.template_key,
    template_type = excluded.template_type,
    subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    updated_at = now();
end $$;
