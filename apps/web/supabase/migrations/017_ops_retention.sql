create or replace function public.cleanup_runner_heartbeats(days integer)
returns integer
language plpgsql
as $$
declare
  deleted_count integer;
begin
  delete from public.runner_heartbeats
  where ts < now() - make_interval(days => days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.cleanup_apply_run_events(days integer)
returns integer
language plpgsql
as $$
declare
  deleted_count integer;
begin
  delete from public.apply_run_events
  where ts < now() - make_interval(days => days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.cleanup_ops_alerts(days integer)
returns integer
language plpgsql
as $$
declare
  deleted_count integer;
begin
  delete from public.ops_alerts
  where created_at < now() - make_interval(days => days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
