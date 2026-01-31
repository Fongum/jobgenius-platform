create table if not exists public.runner_heartbeats (
  runner_id text not null,
  ts timestamptz default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists runner_heartbeats_runner_ts_idx
  on public.runner_heartbeats (runner_id, ts desc);

create table if not exists public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null,
  type text not null,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists ops_alerts_created_at_idx
  on public.ops_alerts (created_at desc);

create index if not exists ops_alerts_resolved_at_idx
  on public.ops_alerts (resolved_at);

create table if not exists public.jobseeker_consents (
  id uuid primary key default gen_random_uuid(),
  jobseeker_id uuid references public.job_seekers(id) on delete cascade,
  consent_type text not null,
  accepted_at timestamptz default now(),
  version text not null,
  text_hash text not null
);

create index if not exists jobseeker_consents_jobseeker_idx
  on public.jobseeker_consents (jobseeker_id, consent_type, version);

alter table public.runner_heartbeats enable row level security;
alter table public.ops_alerts enable row level security;
alter table public.jobseeker_consents enable row level security;

create or replace view public.v_ops_kpis_hourly as
  with run_events as (
    select
      date_trunc('hour', e.ts) as hour,
      runs.ats_type as ats_type,
      e.event_type as event_type,
      e.payload ->> 'reason' as reason
    from public.apply_run_events e
    join public.application_runs runs on runs.id = e.run_id
  ),
  attention_events as (
    select
      date_trunc('hour', ai.created_at) as hour,
      runs.ats_type as ats_type,
      ai.reason as reason
    from public.attention_items ai
    join public.application_queue queue on queue.id = ai.queue_id
    join public.application_runs runs on runs.queue_id = queue.id
  ),
  pause_events as (
    select hour, ats_type, reason
    from run_events
    where event_type = 'NEEDS_ATTENTION'
    union all
    select hour, ats_type, reason
    from attention_events
  ),
  pause_rollup as (
    select hour, ats_type, count(*) as paused
    from pause_events
    group by hour, ats_type
  ),
  pause_top as (
    select hour, ats_type, reason as top_pause_reason
    from (
      select
        hour,
        ats_type,
        reason,
        row_number() over (partition by hour, ats_type order by count(*) desc) as rn
      from pause_events
      group by hour, ats_type, reason
    ) ranked
    where rn = 1
  )
  select
    re.hour,
    re.ats_type,
    count(*) filter (where re.event_type = 'RUNNING') as claimed,
    count(*) filter (where re.event_type = 'APPLIED') as completed,
    coalesce(pr.paused, 0) as paused,
    case
      when count(*) filter (where re.event_type = 'RUNNING') > 0
        then round(
          (count(*) filter (where re.event_type = 'APPLIED'))::numeric
          / (count(*) filter (where re.event_type = 'RUNNING')),
          3
        )
      else null
    end as success_rate,
    pt.top_pause_reason
  from run_events re
  left join pause_rollup pr
    on pr.hour = re.hour and pr.ats_type = re.ats_type
  left join pause_top pt
    on pt.hour = re.hour and pt.ats_type = re.ats_type
  group by re.hour, re.ats_type, pr.paused, pt.top_pause_reason;
