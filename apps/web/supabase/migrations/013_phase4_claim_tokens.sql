alter table public.application_runs
  add column if not exists claim_token text;

create index if not exists application_runs_claim_token_idx
  on public.application_runs (claim_token);
