# jobgenius-platform
An autonomous job application, interview prep, and recruiter collaboration platform with agentic workflows and human-in-the-loop control.

## How to run (web)
1. `cd apps/web`
2. Create `.env.local` with Supabase keys:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AM_EMAIL` (internal AM header fallback)
3. `npm install`
4. `npm run dev`

## How to load the extension
1. Open Chrome → `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `apps/extension`.
4. Set API Base URL, AM Email, and Job Seeker ID in the popup.

## Phase 3 (Apply & Automation Layer)
- **Control plane**: `apps/web` stores runs, logs, queue state, and AM actions.
- **Execution plane**: `apps/extension` polls `/api/apply/next` and runs basic ATS steps.
- **Human-in-the-loop**: Captcha/2FA/unknown steps set `NEEDS_ATTENTION` and alert AMs.
- **Retry model**: 2 retries per run (configurable per run).

## Phase 4 (Execution Layer v1)
- Extension runner polls `/api/apply/next` and runs ATS adapters (LinkedIn/Greenhouse/Workday).
- Resume uploads use `job_seekers.resume_url` (best-effort).
- Company info fetcher stores emails in `company_info` and creates outreach drafts + outbox rows.

## Demo seed/reset
- `POST /api/seed/demo` creates a demo AM/jobseeker, two jobs, one READY run, and one NEEDS_ATTENTION run.
- `POST /api/seed/reset` deletes the demo data.
