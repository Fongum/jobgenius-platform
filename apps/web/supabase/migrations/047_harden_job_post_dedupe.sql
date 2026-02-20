-- Migration: Hard dedupe guardrails for discovered jobs
-- 1) Backfill source_name from legacy source when missing.
-- 2) Collapse historical source_name+external_id duplicates by keeping the newest row active.
-- 3) Enforce future uniqueness for active rows at the DB layer.

UPDATE public.job_posts
SET source_name = source
WHERE source_name IS NULL
  AND source IS NOT NULL;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY source_name, external_id
      ORDER BY
        coalesce(last_seen_at, discovered_at, created_at) DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.job_posts
  WHERE source_name IS NOT NULL
    AND external_id IS NOT NULL
)
UPDATE public.job_posts AS posts
SET external_id = NULL,
    is_active = false
FROM ranked
WHERE posts.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS job_posts_source_external_id_active_uidx
  ON public.job_posts (source_name, external_id)
  WHERE source_name IS NOT NULL
    AND external_id IS NOT NULL
    AND coalesce(is_active, true) = true;
