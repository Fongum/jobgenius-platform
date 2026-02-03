do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recruiter_threads'
      and column_name = 'jobseeker_id'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recruiter_threads'
        and column_name = 'job_seeker_id'
    ) then
      execute 'update public.recruiter_threads set job_seeker_id = coalesce(job_seeker_id, jobseeker_id)';
      execute 'alter table public.recruiter_threads drop column jobseeker_id';
    else
      execute 'alter table public.recruiter_threads rename column jobseeker_id to job_seeker_id';
    end if;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints tc
    where tc.constraint_schema = 'public'
      and tc.table_name = 'recruiter_threads'
      and tc.constraint_type = 'FOREIGN KEY'
      and tc.constraint_name = 'recruiter_threads_job_seeker_id_fkey'
  ) then
    begin
      execute 'alter table public.recruiter_threads drop constraint if exists recruiter_threads_jobseeker_id_fkey';
      execute 'alter table public.recruiter_threads add constraint recruiter_threads_job_seeker_id_fkey foreign key (job_seeker_id) references public.job_seekers(id) on delete cascade';
    exception when others then
      null;
    end;
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'recruiter_threads'
      and indexname = 'recruiter_threads_recruiter_id_jobseeker_id_key'
  ) then
    execute 'drop index if exists public.recruiter_threads_recruiter_id_jobseeker_id_key';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'recruiter_threads'
      and indexname = 'recruiter_threads_recruiter_id_job_seeker_id_key'
  ) then
    begin
      execute 'alter table public.recruiter_threads add constraint recruiter_threads_recruiter_id_job_seeker_id_key unique (recruiter_id, job_seeker_id)';
    exception when others then
      null;
    end;
  end if;
end $$;
