-- Migration: API rate limiting primitives
-- Adds a shared table + function for fixed-window request limits.

create table if not exists public.request_rate_limits (
  key text primary key,
  count integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists request_rate_limits_window_idx
  on public.request_rate_limits (window_started_at);

create index if not exists request_rate_limits_blocked_idx
  on public.request_rate_limits (blocked_until)
  where blocked_until is not null;

alter table public.request_rate_limits enable row level security;

drop policy if exists service_role_all_request_rate_limits on public.request_rate_limits;
create policy service_role_all_request_rate_limits
  on public.request_rate_limits
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer default 0
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.request_rate_limits%rowtype;
  v_window_ends_at timestamptz;
  v_retry integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'p_key is required';
  end if;

  if p_limit <= 0 then
    raise exception 'p_limit must be greater than 0';
  end if;

  if p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be greater than 0';
  end if;

  if p_block_seconds < 0 then
    raise exception 'p_block_seconds must be >= 0';
  end if;

  insert into public.request_rate_limits (key, count, window_started_at, blocked_until, updated_at)
  values (p_key, 0, v_now, null, v_now)
  on conflict (key) do nothing;

  select *
    into v_row
    from public.request_rate_limits
   where key = p_key
   for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_retry := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    return query select false, 0, v_retry;
    return;
  end if;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    v_row.count := 0;
    v_row.window_started_at := v_now;
  end if;

  if v_row.count + 1 > p_limit then
    if p_block_seconds > 0 then
      v_row.blocked_until := v_now + make_interval(secs => p_block_seconds);
      v_retry := p_block_seconds;
    else
      v_row.blocked_until := null;
      v_window_ends_at := v_row.window_started_at + make_interval(secs => p_window_seconds);
      v_retry := greatest(1, ceil(extract(epoch from (v_window_ends_at - v_now)))::integer);
    end if;

    update public.request_rate_limits
       set count = v_row.count,
           window_started_at = v_row.window_started_at,
           blocked_until = v_row.blocked_until,
           updated_at = v_now
     where key = p_key;

    return query select false, 0, v_retry;
    return;
  end if;

  v_row.count := v_row.count + 1;
  v_window_ends_at := v_row.window_started_at + make_interval(secs => p_window_seconds);

  update public.request_rate_limits
     set count = v_row.count,
         window_started_at = v_row.window_started_at,
         blocked_until = null,
         updated_at = v_now
   where key = p_key;

  return query
  select
    true,
    greatest(p_limit - v_row.count, 0),
    greatest(0, ceil(extract(epoch from (v_window_ends_at - v_now)))::integer);
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer, integer) to service_role;

comment on table public.request_rate_limits is 'Shared fixed-window counters for API rate limiting.';
comment on function public.check_rate_limit(text, integer, integer, integer) is 'Atomic rate-limit check/increment for service-side APIs.';
