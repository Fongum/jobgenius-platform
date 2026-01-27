create extension if not exists pgcrypto;

create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text,
  location text,
  description text,
  url text not null,
  source text default 'extension',
  created_at timestamptz not null default now(),
  unique (url)
);
