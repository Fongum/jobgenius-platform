alter table public.tailored_resumes
  add column if not exists resume_url text;
