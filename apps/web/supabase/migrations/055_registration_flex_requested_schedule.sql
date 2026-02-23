-- Migration 055: Store proposed amount/date schedule for flexible registration requests.

alter table public.registration_flex_requests
  add column if not exists requested_schedule jsonb not null default '[]'::jsonb;

alter table public.registration_flex_requests
  drop constraint if exists registration_flex_requests_requested_schedule_is_array;

alter table public.registration_flex_requests
  add constraint registration_flex_requests_requested_schedule_is_array
  check (jsonb_typeof(requested_schedule) = 'array');

alter table public.registration_flex_requests
  drop constraint if exists registration_flex_requests_requested_schedule_size;

alter table public.registration_flex_requests
  add constraint registration_flex_requests_requested_schedule_size
  check (jsonb_array_length(requested_schedule) between 0 and 12);
