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
1. Set **AM Email** (this is sent as the `x-am-email` header).
2. Set **Active Job Seeker ID** (UUID from the dashboard).
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
