# jobgenius-platform
An autonomous job application, interview prep, and recruiter collaboration platform with agentic workflows and human-in-the-loop control.

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
  - `/api/outreach/scheduler/run` runs via Vercel Cron every 15 minutes (`OPS_API_KEY` required).
  - `/api/background/run` processes queued background jobs via Vercel Cron every 5 minutes (`OPS_API_KEY` required).
  - `/api/outreach/metrics` exposes conversion + telemetry metrics (ops or authorized AM).
  - One-time backfill (safe dry-run default):
    - `GET /api/outreach/backfill/run?ops_key=${OPS_API_KEY}`
    - Apply changes: `GET /api/outreach/backfill/run?ops_key=${OPS_API_KEY}&dry_run=false`
  - Dashboard view: `/dashboard/outreach/conversion`.

## Demo seed/reset
- `POST /api/seed/demo` creates a demo AM/jobseeker, two jobs, one READY run, and one NEEDS_ATTENTION run.
- `POST /api/seed/reset` deletes the demo data.
