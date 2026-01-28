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

Response includes `job_seeker_id`, `job_post_ids`, and `run_ids`.

Example:
```bash
curl -X POST http://localhost:3000/api/seed/demo
curl -X POST http://localhost:3000/api/seed/reset
```
