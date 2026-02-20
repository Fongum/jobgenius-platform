# jobgenius-platform
An autonomous job application, interview prep, and recruiter collaboration platform with agentic workflows and human-in-the-loop control.

## Getting Started
1. Add GitHub repository secrets for scheduled jobs:
   - `WEB_BASE_URL` (e.g. `https://your-vercel-app.vercel.app`)
   - `OPS_API_KEY` (must match the backend `OPS_API_KEY`)
2. To test scheduled jobs locally via manual dispatch:
   - Go to **Actions** → **Scheduled Jobs** → **Run workflow** (uses `workflow_dispatch`).

## How to run (web)
1. `cd apps/web`
2. Create `.env.local` with Supabase keys:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. `npm install`
4. `npm run dev`

## How to load the extension
1. Open Chrome → `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `apps/extension`.
4. Set API Base URL, authenticate with your AM Code, and choose a Job Seeker in the popup.

## Phase 3 (Apply & Automation Layer)
- **Control plane**: `apps/web` stores runs, logs, queue state, and AM actions.
- **Execution plane**: `apps/extension` polls `/api/apply/next` and runs basic ATS steps.
- **Human-in-the-loop**: Captcha/2FA/unknown steps set `NEEDS_ATTENTION` and alert AMs.
- **Retry model**: 2 retries per run (configurable per run).

## Phase 4 (Execution Layer v1)
- Extension runner polls `/api/apply/next` and runs ATS adapters (LinkedIn/Greenhouse/Workday).
- Resume uploads use `job_seekers.resume_url` (best-effort).
- Company info fetcher stores emails in `company_info` and creates outreach drafts + outbox rows.

## Cloud Runner (Phase 5.0)
- Service lives in `apps/runner`
- Uses Playwright to execute apply runs 24/7 via `/api/apply/next-global`
- Configure env: `JOBGENIUS_API_BASE_URL`, `RUNNER_AUTH_TOKEN`, `RUNNER_DEFAULT_EMAIL`, `RUNNER_ID`, `RUNNER_POLL_INTERVAL_MS`, `RUNNER_CONCURRENCY`
- Local run: `npm install` then `npm run start`

## Outreach CRM + Email (Phase 6)
- Core CRM entities:
  - `recruiters`, `recruiter_threads`, `outreach_sequences`, `outreach_messages`
  - `outreach_plans` (deterministic outreach intelligence + risk scoring)
  - `recruiter_opt_outs` (compliance/opt-out tracking)
- Outreach state machine:
  - Message states: `DRAFTED -> QUEUED -> SENT -> OPENED/REPLIED/BOUNCED/FOLLOWUP_DUE -> CLOSED`
  - Scheduler auto-creates adaptive follow-ups when no reply thresholds are crossed.
- Email infrastructure:
  - `EMAIL_SEND_PROVIDER` (`resend` or `stub`)
  - `EMAIL_FROM_ADDRESS`
  - `RESEND_API_KEY`
  - `OUTREACH_FROM_EMAIL`
  - `OUTREACH_REPLY_TO_EMAIL` (optional)
  - `OUTREACH_WEBHOOK_SECRET` (for webhook verification)
  - `OUTREACH_TRACK_BASE_URL` (open tracking pixel base URL)
  - Production requires `EMAIL_SEND_PROVIDER=resend` + valid `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`.
- Follow-up automation controls:
  - `OUTREACH_NO_REPLY_HOURS` (default `72`)
  - `OUTREACH_OPENED_NO_REPLY_HOURS` (default `36`)
  - `OUTREACH_MAX_FOLLOWUPS` (default `2`)
- Consent/compliance gates:
  - Required consent types default to:
    - `OUTREACH_AUTOMATION`
    - `OUTREACH_CONTACT_AUTHORIZATION`
    - `OUTREACH_DATA_USAGE`
  - Optional override: `OUTREACH_REQUIRED_CONSENTS=...`
- Monitoring:
  - `/api/outreach/scheduler/run` runs via GitHub Actions every 15 minutes (`OPS_API_KEY` required).
  - `/api/background/run` processes queued background jobs via GitHub Actions every 5 minutes (`OPS_API_KEY` required).
  - `/api/outreach/metrics` exposes conversion + telemetry metrics (ops or authorized AM).
  - One-time backfill (safe dry-run default):
    - `curl -H "x-ops-key: ${OPS_API_KEY}" "${WEB_BASE_URL}/api/outreach/backfill/run"`
    - Apply changes: `curl -H "x-ops-key: ${OPS_API_KEY}" "${WEB_BASE_URL}/api/outreach/backfill/run?dry_run=false"`
  - Dashboard view: `/dashboard/outreach/conversion`.

## Scheduling
Vercel Cron is disabled for Hobby plan deploys. We now use GitHub Actions instead.

Workflow:
- `.github/workflows/scheduled-jobs.yml`

Schedules:
- Every 5 minutes: `/api/ops/alerts/run`
- Every 5 minutes: `/api/background/run`
- Every 15 minutes: `/api/outreach/scheduler/run`
- Daily: `/api/ops/retention/run`

## Demo seed/reset
- `POST /api/seed/demo` creates a demo AM/jobseeker, two jobs, one READY run, and one NEEDS_ATTENTION run.
- `POST /api/seed/reset` deletes the demo data.
- Seed routes are disabled in production unless `ALLOW_SEED_ENDPOINTS=true`, and production calls must include `x-ops-key: ${OPS_API_KEY}`.

## Security controls
- Login rate limit envs:
  - `AUTH_LOGIN_RATE_LIMIT_MAX` (default `10`)
  - `AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC` (default `900`)
  - `AUTH_LOGIN_RATE_LIMIT_BLOCK_SEC` (default `900`)
- Extension auth rate limit envs:
  - `EXTENSION_AUTH_RATE_LIMIT_MAX` (default `8`)
  - `EXTENSION_AUTH_RATE_LIMIT_WINDOW_SEC` (default `900`)
  - `EXTENSION_AUTH_RATE_LIMIT_BLOCK_SEC` (default `900`)
