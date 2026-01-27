alter table public.saved_jobs
add column if not exists raw_html text,
add column if not exists raw_text text;
