-- ============================================================
-- 124: recruiter directory — one row per recruiter, across outreach and
-- the partner program.
--
-- The outreach "Recruiters" page listed threads, so a recruiter written to
-- for three seekers appeared three times, and partner role requests lived
-- on a separate admin-only screen. This function joins both, per recruiter,
-- and decides visibility in one place:
--
--   admin                -> every recruiter, every thread
--   account manager      -> recruiters they own, recruiters with a role
--                           request assigned to them, and recruiters that
--                           have a thread with one of their seekers
--
-- An AM only *counts* threads belonging to other AMs' seekers
-- (hidden_thread_count); which seekers those are is not theirs to see.
--
-- Passing p_recruiter_id turns it into the access check for one recruiter:
-- zero rows means "not visible to you".
--
-- Called only through the service-role client, after the route has
-- authenticated the caller; execute is revoked from PUBLIC so anon and
-- authenticated cannot call it with an arbitrary p_account_manager_id.
-- ============================================================

create or replace function public.recruiter_directory(
  p_account_manager_id uuid,
  p_is_admin boolean default false,
  p_search text default null,
  p_filter text default 'all',
  p_recruiter_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  title text,
  company text,
  email text,
  linkedin_url text,
  partner_type text,
  source text,
  status text,
  notes text,
  do_not_contact boolean,
  opted_out boolean,
  owner_account_manager_id uuid,
  owner_name text,
  own_thread_count int,
  visible_thread_count int,
  hidden_thread_count int,
  best_stage text,
  open_request_count int,
  total_request_count int,
  last_contacted_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
set search_path = public
as $$
  with my_seekers as (
    select a.job_seeker_id
    from job_seeker_assignments a
    where a.account_manager_id = p_account_manager_id
  ),
  threads as (
    select
      t.recruiter_id,
      t.stage,
      t.last_reply_at,
      t.job_seeker_id in (select job_seeker_id from my_seekers) as is_own
    from recruiter_threads t
  ),
  thread_agg as (
    select
      recruiter_id,
      count(*) filter (where is_own)::int as own_threads,
      count(*) filter (where p_is_admin or is_own)::int as visible_threads,
      count(*) filter (where not (p_is_admin or is_own))::int as hidden_threads,
      -- Furthest stage among the threads this caller can see; CLOSED ranks
      -- lowest so one live conversation outranks any number of closed ones.
      max(case stage
        when 'INTERVIEWING' then 4
        when 'ENGAGED' then 3
        when 'CONTACTED' then 2
        when 'NEW' then 1
        else 0 end) filter (where p_is_admin or is_own) as best_rank,
      max(last_reply_at) as last_reply_at
    from threads
    group by recruiter_id
  ),
  request_agg as (
    select
      q.recruiter_id,
      count(*)::int as total_requests,
      count(*) filter (where q.status not in ('closed', 'rejected'))::int as open_requests,
      bool_or(q.assigned_account_manager_id = p_account_manager_id) as assigned_to_me,
      max(q.created_at) as last_request_at
    from recruiter_role_requests q
    group by q.recruiter_id
  ),
  directory as (
    select
      r.id,
      r.name,
      r.title,
      r.company,
      r.email,
      r.linkedin_url,
      r.partner_type,
      r.source,
      r.status,
      r.notes,
      r.do_not_contact,
      exists (select 1 from recruiter_opt_outs o where o.recruiter_id = r.id) as opted_out,
      r.owner_account_manager_id,
      owner.name as owner_name,
      coalesce(ta.own_threads, 0) as own_thread_count,
      coalesce(ta.visible_threads, 0) as visible_thread_count,
      coalesce(ta.hidden_threads, 0) as hidden_thread_count,
      case
        when coalesce(ta.visible_threads, 0) = 0 then null
        else (array['CLOSED', 'NEW', 'CONTACTED', 'ENGAGED', 'INTERVIEWING'])[coalesce(ta.best_rank, 0) + 1]
      end as best_stage,
      coalesce(ra.open_requests, 0) as open_request_count,
      coalesce(ra.total_requests, 0) as total_request_count,
      r.last_contacted_at,
      greatest(r.last_contacted_at, ta.last_reply_at, ra.last_request_at, r.updated_at) as last_activity_at,
      r.created_at,
      coalesce(ra.assigned_to_me, false) as assigned_to_me
    from recruiters r
    left join thread_agg ta on ta.recruiter_id = r.id
    left join request_agg ra on ra.recruiter_id = r.id
    left join account_managers owner on owner.id = r.owner_account_manager_id
    where p_recruiter_id is null or r.id = p_recruiter_id
  )
  select
    id, name, title, company, email, linkedin_url, partner_type, source, status, notes,
    do_not_contact, opted_out, owner_account_manager_id, owner_name,
    own_thread_count, visible_thread_count, hidden_thread_count, best_stage,
    open_request_count, total_request_count, last_contacted_at, last_activity_at, created_at,
    count(*) over () as total_count
  from directory
  where
    (
      p_is_admin
      or own_thread_count > 0
      or owner_account_manager_id = p_account_manager_id
      or assigned_to_me
    )
    and (
      nullif(btrim(p_search), '') is null
      -- position() rather than ILIKE: a search for "j_doe" must not treat
      -- the underscore as a wildcard.
      or position(lower(btrim(p_search)) in lower(coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(company, ''))) > 0
    )
    and (
      coalesce(p_filter, 'all') = 'all'
      or (p_filter = 'mine' and (
        owner_account_manager_id = p_account_manager_id or own_thread_count > 0 or assigned_to_me
      ))
      or (p_filter = 'active' and best_stage in ('NEW', 'CONTACTED', 'ENGAGED', 'INTERVIEWING'))
      or (p_filter = 'partners' and (total_request_count > 0 or partner_type is not null))
      or (p_filter = 'do_not_contact' and (do_not_contact or opted_out))
      or (p_filter = 'unowned' and owner_account_manager_id is null)
    )
  order by last_activity_at desc nulls last, id
  limit greatest(least(coalesce(p_limit, 50), 200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.recruiter_directory(uuid, boolean, text, text, uuid, int, int) from public;
grant execute on function public.recruiter_directory(uuid, boolean, text, text, uuid, int, int) to service_role;
