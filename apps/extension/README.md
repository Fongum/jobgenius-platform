# JobGenius Saver Extension

Chrome extension for AMs to save jobs and run the Phase 3 automation runner.

## Load unpacked in Chrome
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder `apps/extension`.

## Set the API Base URL
1. Click the extension icon to open the popup.
2. Paste your API base URL (for example: `https://jobgenius-platform.vercel.app`).
3. The value is saved automatically.

## Configure runner (Phase 3)
1. Connect with your **AM Code** to authenticate.
2. Select the **Active Job Seeker** from the dropdown.
3. Click **Start Runner**.
4. The service worker polls `/api/apply/next` every minute and executes jobs.

## Test
1. Open any job listing page in a tab.
2. Click **Save Job** in the extension popup.
3. Visit `/dashboard/saved-jobs` in your web app to confirm the entry appears.

## Runner behavior (MVP)
- Supports LinkedIn Easy Apply, Greenhouse, Workday (basic click/fill).
- Logs events to `/api/apply/event`.
- Captcha or unknown steps pause the run and flag **Needs Attention** in the dashboard.

## Runner v1 testing
1. Seed demo data with `POST /api/seed/demo`.
2. Copy the returned `job_seeker_id` into the extension popup.
3. Start the runner and watch `/dashboard/jobseekers/[id]/queue`.
4. Expect either APPLIED or NEEDS_ATTENTION with a reason.

## Local testing notes
- The runner sends `Authorization: Bearer <token>` and `x-runner: extension` headers.
- Resume uploads use `resume_url` from the job seeker record (best-effort).
