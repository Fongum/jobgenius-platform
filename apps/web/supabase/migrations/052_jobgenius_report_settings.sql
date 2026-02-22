-- Migration 052: JobGenius report settings
-- Adds admin-managed prompts for JobGenius seeker reports.

create table if not exists public.jobgenius_report_settings (
  id uuid primary key default gen_random_uuid(),
  settings_key text not null unique default 'default',
  system_prompt text not null,
  output_instructions text not null,
  default_goal text not null,
  updated_by uuid references public.account_managers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.jobgenius_report_settings (
  settings_key,
  system_prompt,
  output_instructions,
  default_goal
)
values (
  'default',
  'You are JobGenius, an expert career strategist for job seekers. Use the seeker profile details plus admin context to produce a practical, motivating, and specific report focused on getting the seeker hired faster.',
  'Prioritize high-impact improvements, realistic timelines, and concrete actions. Avoid generic advice. Tie recommendations to the seeker''s profile gaps, target roles, and constraints.',
  'Help this seeker secure a strong-fit job with interviews, better positioning, and clear next actions.'
)
on conflict (settings_key) do nothing;

alter table public.jobgenius_report_settings enable row level security;

drop policy if exists "service_role_all_jobgenius_report_settings" on public.jobgenius_report_settings;
create policy "service_role_all_jobgenius_report_settings"
  on public.jobgenius_report_settings for all
  using (auth.role() = 'service_role');

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at'
      and n.nspname = 'public'
  ) then
    drop trigger if exists trg_jobgenius_report_settings_updated_at on public.jobgenius_report_settings;
    create trigger trg_jobgenius_report_settings_updated_at
      before update on public.jobgenius_report_settings
      for each row execute function public.set_updated_at();
  end if;
end
$$;
