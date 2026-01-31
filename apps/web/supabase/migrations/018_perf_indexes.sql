create index if not exists application_runs_status_locked_updated_idx
  on public.application_runs (status, locked_at, updated_at);

create index if not exists application_runs_job_seeker_status_locked_updated_idx
  on public.application_runs (job_seeker_id, status, locked_at, updated_at);

create index if not exists apply_run_events_ts_idx
  on public.apply_run_events (ts);

create index if not exists apply_run_events_event_type_ts_idx
  on public.apply_run_events (event_type, ts);
