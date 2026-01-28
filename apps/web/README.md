# JobGenius Web

## Run locally
1. `npm install`
2. Create `.env.local` with Supabase keys.
3. `npm run dev`

## Demo fixture
- `POST /api/seed/demo` creates:
  - demo AM + job seeker
  - 2 job posts
  - 1 saved job
  - 1 READY run + 1 NEEDS_ATTENTION run
- `POST /api/seed/reset` removes the demo data.

Response includes `job_seeker_id` and `job_post_ids` to speed QA.
