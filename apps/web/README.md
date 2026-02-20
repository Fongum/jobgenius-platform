# JobGenius Web

## Run locally
1. `npm install`
2. Create `.env.local` with Supabase keys.
3. `npm run dev`

## Demo fixture
- `POST /api/seed/demo` creates:
  - demo AM + job seeker
  - 4 job posts
  - 1 saved job
  - 3 READY runs (LinkedIn, Greenhouse, Workday)
  - 1 NEEDS_ATTENTION run (SMS OTP)
- `POST /api/seed/reset` removes the demo data.
- Seed routes are for local/test use. In production, they require `ALLOW_SEED_ENDPOINTS=true` and `x-ops-key` auth.

Response includes `job_seeker_id`, `job_post_ids`, and `run_ids`.

Example:
```bash
curl -X POST http://localhost:3000/api/seed/demo
curl -X POST http://localhost:3000/api/seed/reset
```

## Runner dry run + OTP
- Extension popup: enable "Dry run (no submit)" to pause at submit with reason `DRY_RUN_CONFIRM_SUBMIT`.
- Dashboard attention: click "Resume (real submit)" to allow the runner to submit.
- OTP email flow:
  - AM can `POST /api/otp/submit` with a code (channel EMAIL/SMS).
  - Runner polls `GET /api/otp/latest?jobSeekerId=...` for email OTP and marks it used via `POST /api/otp/mark-used`.

## Auth rate limits
- Login:
  - `AUTH_LOGIN_RATE_LIMIT_MAX` (default `10`)
  - `AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC` (default `900`)
  - `AUTH_LOGIN_RATE_LIMIT_BLOCK_SEC` (default `900`)
- Extension auth:
  - `EXTENSION_AUTH_RATE_LIMIT_MAX` (default `8`)
  - `EXTENSION_AUTH_RATE_LIMIT_WINDOW_SEC` (default `900`)
  - `EXTENSION_AUTH_RATE_LIMIT_BLOCK_SEC` (default `900`)
