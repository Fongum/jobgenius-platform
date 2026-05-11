# JobGenius Playwright Runner

## Overview
Minimal Playwright worker that polls JobGenius for application work, opens a browser, fills Greenhouse forms, uploads a resume, submits the application, and reports status back to the API.

The worker prefers the newer task contract:
- `POST /api/apply/tasks/claim`
- `POST /api/apply/runs/start`

If those routes are not present, it falls back to the current monorepo apply lifecycle:
- `GET /api/apply/next-global`
- `POST /api/apply/start`
- `POST /api/apply/event`
- `POST /api/apply/complete`
- `POST /api/apply/pause`

## Environment
- `API_BASE_URL` required
- `RUNNER_AUTH_TOKEN` required
- `RUNNER_ID` optional
- `RUNNER_POLL_INTERVAL_MS` default `5000`
- `PLAYWRIGHT_HEADLESS` default `true`
- `PLAYWRIGHT_SUBMIT_ENABLED` default `false`
- `PLAYWRIGHT_SLOW_MO_MS` optional
- `PLAYWRIGHT_NAVIGATION_TIMEOUT_MS` default `45000`
- `PLAYWRIGHT_ACTION_TIMEOUT_MS` default `15000`
- `VERIFY_GREENHOUSE_URL` optional helper for `npm run prepare:greenhouse`
- `VERIFY_JOB_SEEKER_ID` optional helper override for `npm run prepare:greenhouse`
- `VERIFY_AUTO_START` default `true` for `npm run prepare:greenhouse`

Backward-compatible aliases are also supported:
- `JOBGENIUS_API_BASE_URL`
- `JOBGENIUS_API_KEY`

Backend requirements for runner auth:
- `RUNNER_AUTH_TOKEN` must be set in `apps/web`
- `RUNNER_AM_EMAIL` must be set in `apps/web`
- the runner bearer token must exactly match the backend `RUNNER_AUTH_TOKEN`

## Local Run
```bash
cd apps/runner
npm install
npx playwright install
npm run check:auth
npm start
```

## Current Scope
- Greenhouse adapter only
- Fills `input`, `textarea`, and `select`
- Uploads resume files when an upload field is present
- Pauses runs clearly when required fields remain, resume upload fails, submit is missing, or confirmation cannot be detected
- Skips clicking submit unless `PLAYWRIGHT_SUBMIT_ENABLED=true`

## Real Greenhouse Verification
Use a real public Greenhouse application URL to create a deterministic verification task for the runner's assigned seeker.

```bash
cd apps/runner
npm run prepare:greenhouse -- "https://boards.greenhouse.io/<company>/jobs/<job-id>"
npm start
```

Notes:
- Stop any other background runner process first, or it may claim the task before your foreground run does.
- The helper saves the job, queues it, and creates or retries a run.
- Leave `PLAYWRIGHT_SUBMIT_ENABLED` unset or `false` for a safe pre-submit verification.
- Set `PLAYWRIGHT_SUBMIT_ENABLED=true` only when you want the runner to attempt a real submission.
