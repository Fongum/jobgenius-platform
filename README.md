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
