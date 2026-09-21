// ============================================================
// What the bulk matcher stores in job_match_scores, and how existing rows are read.
//
// Production (2026-09-19): 103,192 score rows for 25 seekers (~4,100 each) plus
// 135,825 match_features rows, because the sorting agent scored every active
// seeker against up to 5,000 jobs and stored EVERY result. 99.3% of them scored
// under 40; only 127 reached the default threshold of 60 and none reached 80.
// No list surface reads anything under 40 (the extension cockpit floors at 40
// and the adjacent lane at max(40, threshold - 15)), so those rows were dead
// weight: ordering the table by created_at timed out, and nothing had ever been
// archived.
//
// Two rules:
//   1. A NEW pair scoring under the floor is not stored. A pair that already has
//      a row is always updated, so a row that used to score high can never be
//      left stale by a later low score.
//   2. Existing rows are looked up with real pagination. The old lookup relied on
//      one query, which PostgREST silently truncates at 1,000 rows, so
//      `only_unscored` skipped almost nothing.
//
// The floor is clamped to READER_MIN_SCORE so a misconfigured env var can never
// make the matcher drop scores that a screen would have shown.
// ============================================================

/** The lowest score any screen reads. Nothing below this is ever displayed. */
export const READER_MIN_SCORE = 40;
export const DEFAULT_STORE_FLOOR = READER_MIN_SCORE;

/**
 * Minimum score for a NEW pair to be stored (MATCH_STORE_MIN_SCORE). 0 disables
 * the floor (store everything, the previous behaviour). Clamped to 0..40.
 */
export function getMatchStoreFloor(
  raw: string | undefined = process.env.MATCH_STORE_MIN_SCORE
): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_STORE_FLOOR;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_STORE_FLOOR;
  return Math.min(Math.max(Math.floor(parsed), 0), READER_MIN_SCORE);
}

export function shouldStoreScore(input: {
  score: number;
  alreadyStored: boolean;
  floor?: number;
}): boolean {
  if (input.alreadyStored) return true;
  return input.score >= (input.floor ?? getMatchStoreFloor());
}

export const scoreKey = (seekerId: string, postId: string) => `${seekerId}:${postId}`;

// ─── Existing-row lookup ─────────────────────────────────────

// Structural type so tests (and any Supabase client) can be passed in.
type PagedQuery = PromiseLike<{
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
}>;
type PagingClient = {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: string[]): {
        order(column: string): {
          order(column: string): {
            range(from: number, to: number): PagedQuery;
          };
        };
      };
    };
  };
};

const PAGE_SIZE = 1000;
const SEEKERS_PER_QUERY = 50; // keeps the in.(...) URL comfortably short

export type ExistingScoreKeys = {
  keys: Set<string>;
  /** False if any page failed to load; callers must then treat unknown pairs as "stored". */
  complete: boolean;
  error?: string;
};

/**
 * Every (seeker, job) pair that already has a score row, for the given seekers.
 * Pages until a page comes back empty (rather than short) so it stays correct
 * even if the server's row cap is below PAGE_SIZE.
 */
export async function loadExistingScoreKeys(
  client: unknown,
  seekerIds: string[]
): Promise<ExistingScoreKeys> {
  const db = client as PagingClient;
  const keys = new Set<string>();

  for (let i = 0; i < seekerIds.length; i += SEEKERS_PER_QUERY) {
    const chunk = seekerIds.slice(i, i + SEEKERS_PER_QUERY);
    let from = 0;

    for (;;) {
      const { data, error } = await db
        .from("job_match_scores")
        .select("job_post_id, job_seeker_id")
        .in("job_seeker_id", chunk)
        // Deterministic order (the unique index) so pages neither repeat nor skip rows.
        .order("job_post_id")
        .order("job_seeker_id")
        .range(from, from + PAGE_SIZE - 1);

      if (error) return { keys, complete: false, error: error.message };
      if (!data || data.length === 0) break;

      for (const row of data) {
        keys.add(scoreKey(String(row.job_seeker_id), String(row.job_post_id)));
      }
      from += data.length;
    }
  }

  return { keys, complete: true };
}
