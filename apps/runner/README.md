# JobGenius Cloud Runner (Phase 5.0)

## Overview
Long-running Playwright worker that polls the JobGenius API for runs and executes ATS steps in the cloud.

## Environment
- `JOBGENIUS_API_BASE_URL` (required)
- `RUNNER_AM_EMAIL` (required, used for internal auth header)
- `RUNNER_ID` (optional)
- `RUNNER_POLL_INTERVAL_MS` (default 60000)
- `RUNNER_CONCURRENCY` (default 5)
- `STORAGE_STATE_PATH` (optional, default `apps/runner/.state`)

## Local run
```bash
npm install
npm run start
```

## Notes
- Storage state is persisted per jobseeker in `.state/{jobSeekerId}.json`.
- For production, store state encrypted in a secure bucket.
