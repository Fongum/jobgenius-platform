-- ============================================================
-- 123: one recruiter per email, and pipeline stage per thread.
--
-- Part 1. recruiters.email had no unique constraint and lookups compared it
-- exactly, so the same person could exist as several rows ("Jane@X.com",
-- "jane@x.com", or two concurrent sends). With duplicates present the
-- outreach lookups (.maybeSingle()) errored and returned null — and the
-- draft send route then skipped its opt-out check. This normalizes every
-- email, merges duplicates into one surviving row (moving all dependents),
-- and adds a normalizing trigger plus a unique index.
--
-- Part 2. Outreach stage (NEW/CONTACTED/ENGAGED/INTERVIEWING/CLOSED) was
-- stored on the shared recruiters row, so one AM closing a recruiter for
-- their seeker closed it for every seeker. It now lives on
-- recruiter_threads.stage. recruiters.status keeps recruiter-wide facts.
-- ============================================================

-- ---------- Part 1: normalize and merge ----------

update public.recruiters
set email = nullif(lower(btrim(email)), '')
where email is distinct from nullif(lower(btrim(email)), '');

-- Survivor per email: the oldest row. Every dependent is moved to it, so the
-- choice only decides whose non-null fields win ties.
create temporary table _recruiter_merge as
select id as loser_id, survivor_id
from (
  select
    id,
    first_value(id) over (
      partition by email
      order by created_at asc nulls last, id
    ) as survivor_id
  from public.recruiters
  where email is not null
) ranked
where id <> survivor_id;

-- Fold the losers' fields into the survivor. Survivor values win; gaps are
-- filled from the most recently updated loser. Do-not-contact and CLOSED are
-- sticky: if any copy of this person opted out or bounced, the merged row has.
with loser_fields as (
  select
    m.survivor_id,
    (array_agg(r.name order by r.updated_at desc nulls last) filter (where r.name is not null))[1] as name,
    (array_agg(r.title order by r.updated_at desc nulls last) filter (where r.title is not null))[1] as title,
    (array_agg(r.company order by r.updated_at desc nulls last) filter (where r.company is not null))[1] as company,
    (array_agg(r.linkedin_url order by r.updated_at desc nulls last) filter (where r.linkedin_url is not null))[1] as linkedin_url,
    (array_agg(r.phone order by r.updated_at desc nulls last) filter (where r.phone is not null))[1] as phone,
    (array_agg(r.company_domain order by r.updated_at desc nulls last) filter (where r.company_domain is not null))[1] as company_domain,
    (array_agg(r.company_website order by r.updated_at desc nulls last) filter (where r.company_website is not null))[1] as company_website,
    (array_agg(r.partner_type order by r.updated_at desc nulls last) filter (where r.partner_type is not null))[1] as partner_type,
    (array_agg(r.intake_source order by r.updated_at desc nulls last) filter (where r.intake_source is not null))[1] as intake_source,
    (array_agg(r.preferred_contact_method order by r.updated_at desc nulls last) filter (where r.preferred_contact_method is not null))[1] as preferred_contact_method,
    (array_agg(r.owner_account_manager_id order by r.updated_at desc nulls last) filter (where r.owner_account_manager_id is not null))[1] as owner_account_manager_id,
    (array_agg(r.source order by r.updated_at desc nulls last) filter (where r.source is not null))[1] as source,
    bool_or(r.do_not_contact) as do_not_contact,
    bool_or(r.status = 'CLOSED') as any_closed,
    max(case r.status
      when 'INTERVIEWING' then 4
      when 'ENGAGED' then 3
      when 'CONTACTED' then 2
      when 'NEW' then 1
      else 0 end) as status_rank,
    max(r.confidence_score) as confidence_score,
    max(r.relationship_score) as relationship_score,
    max(r.last_contacted_at) as last_contacted_at,
    string_agg(r.notes, E'\n\n' order by r.created_at) filter (where nullif(btrim(r.notes), '') is not null) as notes
  from _recruiter_merge m
  join public.recruiters r on r.id = m.loser_id
  group by m.survivor_id
)
update public.recruiters s
set
  name = coalesce(s.name, f.name),
  title = coalesce(s.title, f.title),
  company = coalesce(s.company, f.company),
  linkedin_url = coalesce(s.linkedin_url, f.linkedin_url),
  phone = coalesce(s.phone, f.phone),
  company_domain = coalesce(s.company_domain, f.company_domain),
  company_website = coalesce(s.company_website, f.company_website),
  partner_type = coalesce(s.partner_type, f.partner_type),
  intake_source = coalesce(s.intake_source, f.intake_source),
  preferred_contact_method = coalesce(s.preferred_contact_method, f.preferred_contact_method),
  owner_account_manager_id = coalesce(s.owner_account_manager_id, f.owner_account_manager_id),
  source = coalesce(s.source, f.source),
  do_not_contact = s.do_not_contact or coalesce(f.do_not_contact, false),
  status = case
    when s.status = 'CLOSED' or f.any_closed then 'CLOSED'
    when f.status_rank > (case s.status
      when 'INTERVIEWING' then 4
      when 'ENGAGED' then 3
      when 'CONTACTED' then 2
      when 'NEW' then 1
      else 0 end)
      then (array['NEW', 'CONTACTED', 'ENGAGED', 'INTERVIEWING'])[f.status_rank]
    else s.status
  end,
  confidence_score = greatest(s.confidence_score, f.confidence_score),
  relationship_score = greatest(s.relationship_score, f.relationship_score),
  last_contacted_at = greatest(s.last_contacted_at, f.last_contacted_at),
  notes = nullif(concat_ws(E'\n\n', nullif(btrim(s.notes), ''), f.notes), ''),
  updated_at = now()
from loser_fields f
where s.id = f.survivor_id;

-- Threads. recruiter_threads is unique on (recruiter_id, job_seeker_id), so
-- two copies of a recruiter that both wrote to the same seeker have two
-- threads that must become one. Keeper: the survivor's own thread if it has
-- one, else the oldest.
create temporary table _thread_merge as
select id as loser_thread_id, keeper_id
from (
  select
    t.id,
    first_value(t.id) over (
      partition by coalesce(m.survivor_id, t.recruiter_id), t.job_seeker_id
      order by (m.loser_id is null) desc, t.created_at asc nulls last, t.id
    ) as keeper_id
  from public.recruiter_threads t
  left join _recruiter_merge m on m.loser_id = t.recruiter_id
  where t.recruiter_id in (
    select survivor_id from _recruiter_merge
    union
    select loser_id from _recruiter_merge
  )
) ranked
where id <> keeper_id;

-- Keep the furthest-along facts from the threads being folded in.
with folded as (
  select
    tm.keeper_id,
    max(t.last_reply_at) as last_reply_at,
    min(t.interview_started_at) as interview_started_at,
    min(t.offer_received_at) as offer_received_at
  from _thread_merge tm
  join public.recruiter_threads t on t.id = tm.loser_thread_id
  group by tm.keeper_id
)
update public.recruiter_threads k
set
  last_reply_at = greatest(k.last_reply_at, f.last_reply_at),
  interview_started_at = least(k.interview_started_at, f.interview_started_at),
  offer_received_at = least(k.offer_received_at, f.offer_received_at),
  updated_at = now()
from folded f
where k.id = f.keeper_id;

update public.outreach_messages msg
set recruiter_thread_id = tm.keeper_id
from _thread_merge tm
where msg.recruiter_thread_id = tm.loser_thread_id;

update public.recruiter_opt_outs o
set recruiter_thread_id = tm.keeper_id
from _thread_merge tm
where o.recruiter_thread_id = tm.loser_thread_id;

-- Plans are derived (re-upserted on every send and reply) and unique per
-- thread; the folded-away threads' plans are dropped, not merged.
delete from public.outreach_plans p
using _thread_merge tm
where p.recruiter_thread_id = tm.loser_thread_id;

delete from public.recruiter_threads t
using _thread_merge tm
where t.id = tm.loser_thread_id;

update public.recruiter_threads t
set recruiter_id = m.survivor_id
from _recruiter_merge m
where t.recruiter_id = m.loser_id;

update public.outreach_plans p
set recruiter_id = m.survivor_id
from _recruiter_merge m
where p.recruiter_id = m.loser_id;

-- Opt-outs are unique per recruiter. Keep the earliest one for the merged
-- person; an opt-out on any copy must survive.
delete from public.recruiter_opt_outs o
using _recruiter_merge m
where o.recruiter_id = m.loser_id
  and exists (
    select 1
    from public.recruiter_opt_outs other
    left join _recruiter_merge om on om.loser_id = other.recruiter_id
    where coalesce(om.survivor_id, other.recruiter_id) = m.survivor_id
      and other.id <> o.id
      and (
        om.loser_id is null -- the survivor's own opt-out always wins
        or (other.opted_out_at, other.id) < (o.opted_out_at, o.id)
      )
  );

update public.recruiter_opt_outs o
set recruiter_id = m.survivor_id
from _recruiter_merge m
where o.recruiter_id = m.loser_id;

-- Partner-program dependents carry no per-recruiter uniqueness.
update public.recruiter_role_requests x set recruiter_id = m.survivor_id
from _recruiter_merge m where x.recruiter_id = m.loser_id;

update public.recruiter_partner_activity x set recruiter_id = m.survivor_id
from _recruiter_merge m where x.recruiter_id = m.loser_id;

update public.recruiter_partner_action_tokens x set recruiter_id = m.survivor_id
from _recruiter_merge m where x.recruiter_id = m.loser_id;

update public.recruiter_magic_links x set recruiter_id = m.survivor_id
from _recruiter_merge m where x.recruiter_id = m.loser_id;

update public.recruiter_partner_sessions x set recruiter_id = m.survivor_id
from _recruiter_merge m where x.recruiter_id = m.loser_id;

-- Nothing references the losers any more; ON DELETE CASCADE has nothing left
-- to take with them.
delete from public.recruiters r
using _recruiter_merge m
where r.id = m.loser_id;

drop table _thread_merge;
drop table _recruiter_merge;

-- ---------- Part 1: keep it that way ----------

create or replace function public.normalize_recruiter_email()
returns trigger
language plpgsql
as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  return new;
end;
$$;

drop trigger if exists recruiters_normalize_email on public.recruiters;
create trigger recruiters_normalize_email
  before insert or update of email on public.recruiters
  for each row execute function public.normalize_recruiter_email();

-- Plain (not partial, not expression) so ON CONFLICT (email) can target it.
-- NULL emails stay unconstrained.
create unique index if not exists recruiters_email_unique
  on public.recruiters (email);

-- ---------- Part 2: stage per thread ----------

alter table public.recruiter_threads
  add column if not exists stage text not null default 'NEW';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recruiter_threads_stage_check'
  ) then
    alter table public.recruiter_threads
      add constraint recruiter_threads_stage_check
      check (stage in ('NEW', 'CONTACTED', 'ENGAGED', 'INTERVIEWING', 'CLOSED'));
  end if;
end $$;

-- Backfill. A recruiter with a single thread has a status that was only ever
-- written by that thread, so it is copied as-is. For a recruiter shared by
-- several seekers the status is contaminated, so each thread's stage is
-- rebuilt from its own evidence instead.
with thread_counts as (
  select recruiter_id, count(*) as thread_count
  from public.recruiter_threads
  group by recruiter_id
),
derived as (
  select
    t.id,
    case
      when tc.thread_count = 1
        and r.status in ('NEW', 'CONTACTED', 'ENGAGED', 'INTERVIEWING', 'CLOSED')
        then r.status
      when t.thread_status = 'CLOSED' or t.closed_at is not null then 'CLOSED'
      when t.interview_started_at is not null or t.offer_received_at is not null then 'INTERVIEWING'
      when t.last_reply_at is not null and coalesce(t.reply_sentiment_score, 0) >= 20 then 'ENGAGED'
      when t.last_reply_at is not null then 'CONTACTED'
      when exists (
        select 1 from public.outreach_messages msg
        where msg.recruiter_thread_id = t.id and msg.sent_at is not null
      ) then 'CONTACTED'
      else 'NEW'
    end as stage
  from public.recruiter_threads t
  join public.recruiters r on r.id = t.recruiter_id
  join thread_counts tc on tc.recruiter_id = t.recruiter_id
)
update public.recruiter_threads t
set stage = d.stage
from derived d
where t.id = d.id
  and t.stage is distinct from d.stage;

create index if not exists recruiter_threads_seeker_stage_idx
  on public.recruiter_threads (job_seeker_id, stage);

-- The conversion page's pipeline counts are per thread, so they group by the
-- thread's stage. Column names are unchanged.
create or replace view public.v_outreach_pipeline_status as
  select
    assignments.account_manager_id,
    threads.stage as status,
    count(*) as recruiter_count
  from public.recruiter_threads threads
  join public.job_seeker_assignments assignments
    on assignments.job_seeker_id = threads.job_seeker_id
  group by assignments.account_manager_id, threads.stage;
