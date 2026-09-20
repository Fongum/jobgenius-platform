// ============================================================
// Bulk match storage — POST /api/match/run-all and POST /api/ops/prune-low-matches
//
// Production held 103,192 score rows (99.3% under 40, which no screen reads) and
// 135,825 match_features rows, because run-all stored every seeker x job result.
// Runs the real handlers and the real storage policy against a recording Supabase
// fake; only Supabase, the scoring function and the ranker are stubbed. See
// tests/helpers/supabase-mock.ts for what that can and cannot prove.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, filteredOn, type RecordedCall, type ResultMap } from "./helpers/supabase-mock";

const db = vi.hoisted(() => ({ current: null as unknown }));
const ops = vi.hoisted(() => ({ auth: { ok: true } as { ok: boolean; error?: string } }));
const scoring = vi.hoisted(() => ({ byJob: {} as Record<string, number>, compute: vi.fn() }));
const ranker = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return (db.current as { client: unknown }).client;
  },
}));
vi.mock("@/lib/ops-auth", () => ({ requireOpsAuth: () => ops.auth }));
vi.mock("@/lib/am-access", () => ({ getAccountManagerFromRequest: async () => ({ error: "no session" }) }));
vi.mock("@/lib/rate-limit-presets", () => ({ enforceOpsRateLimit: async () => ({ allowed: true, remaining: 1 }) }));
vi.mock("@/lib/matching", () => ({
  computeMatchScore: scoring.compute,
  parseJobPostSmart: async () => ({}),
}));
vi.mock("@/lib/learned-ranker", () => ({
  recordMatchFeatures: ranker.record,
  featuresFromBreakdown: () => ({}),
  blendScore: ({ heuristic }: { heuristic: number }) => heuristic,
  readBlendAlpha: () => 0,
  getActiveModel: async () => null,
}));

import { POST as runAll } from "@/app/api/match/run-all/route";
import { POST as prune } from "@/app/api/ops/prune-low-matches/route";

function setup(results: ResultMap = {}) {
  const mock = createSupabaseMock(results);
  db.current = mock;
  return mock;
}

/** Serves `rows` page by page, honouring .range() and PostgREST's 1,000-row cap. */
const paged = (rows: unknown[]) => (call: RecordedCall) => {
  const range = call.filters.find((f) => f.method === "range");
  const from = range ? (range.args[0] as number) : 0;
  return { data: rows.slice(from, from + 1000) };
};

const seekerRow = { id: "seeker-1", status: "active", match_threshold: 60 };
const post = (id: string) => ({ id, url: `https://x/${id}`, title: id, company: "Co", description_text: "d", parsed_at: "2026-01-01" });

beforeEach(() => {
  ops.auth = { ok: true };
  ranker.record.mockReset();
  scoring.byJob = {};
  scoring.compute.mockReset().mockImplementation((_seeker: unknown, job: { id: string }) => ({
    score: scoring.byJob[job.id] ?? 0,
    confidence: "medium",
    recommendation: "review",
    reasons: {},
    component_scores: {},
  }));
  delete process.env.MATCH_STORE_MIN_SCORE;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// ─── run-all ─────────────────────────────────────────────────────────

describe("POST /api/match/run-all storage floor", () => {
  const call = (body: unknown = {}) =>
    runAll(new Request("http://localhost/api/match/run-all", { method: "POST", body: JSON.stringify(body) }));

  const upserted = (mock: ReturnType<typeof setup>) =>
    mock.callsFor("job_match_scores", "upsert").flatMap((c) => c.payload as Array<{ job_post_id: string; score: number }>);

  it("requires ops authorization (or an AM session)", async () => {
    ops.auth = { ok: false, error: "Not authorized." };
    const mock = setup();
    expect((await call()).status).toBe(401);
    expect(mock.calls).toHaveLength(0);
  });

  it("does not store NEW pairs below the floor, and records features only for stored pairs", async () => {
    scoring.byJob = { p1: 10, p2: 39, p3: 40, p4: 75 };
    const mock = setup({
      job_seekers: { data: [seekerRow] },
      "job_posts:select": { data: ["p1", "p2", "p3", "p4"].map(post) },
      "job_match_scores:select": paged([]),
    });

    const body = await (await call()).json();
    expect(body).toMatchObject({ seekers_processed: 1, jobs_scored: 4, scores_stored: 2, scores_skipped_below_floor: 2 });
    expect(upserted(mock).map((r) => r.job_post_id).sort()).toEqual(["p3", "p4"]);
    expect(ranker.record).toHaveBeenCalledTimes(2);
  });

  it("still UPDATES a pair that already has a row when its new score is low (never leaves a stale high score)", async () => {
    scoring.byJob = { p1: 5, p2: 5 };
    const mock = setup({
      job_seekers: { data: [seekerRow] },
      "job_posts:select": { data: [post("p1"), post("p2")] },
      "job_match_scores:select": paged([{ job_post_id: "p1", job_seeker_id: "seeker-1" }]),
    });
    const body = await (await call()).json();
    expect(body).toMatchObject({ scores_stored: 1, scores_skipped_below_floor: 1 });
    expect(upserted(mock)).toEqual([expect.objectContaining({ job_post_id: "p1", score: 5 })]);
  });

  it("only_unscored skips existing pairs even when there are more than 1,000 of them", async () => {
    // The old lookup was one query truncated at 1,000 rows, so it skipped almost nothing.
    const posts = Array.from({ length: 1500 }, (_, i) => post(`p${i}`));
    const existing = posts.map((p) => ({ job_post_id: p.id, job_seeker_id: "seeker-1" }));
    posts.push(post("brand-new"));
    scoring.byJob = { "brand-new": 90 };
    setup({
      job_seekers: { data: [seekerRow] },
      "job_posts:select": { data: posts },
      "job_match_scores:select": paged(existing),
    });

    const body = await (await call({ only_unscored: true })).json();
    expect(body.jobs_scored).toBe(1); // only the pair with no row was computed
    expect(scoring.compute).toHaveBeenCalledTimes(1);
    expect(body.scores_stored).toBe(1);
  });

  it("stores every score, and says so, if the existing-rows lookup fails", async () => {
    scoring.byJob = { p1: 3 };
    const mock = setup({
      job_seekers: { data: [seekerRow] },
      "job_posts:select": { data: [post("p1")] },
      "job_match_scores:select": { error: { message: "db down" } },
    });
    const body = await (await call()).json();
    expect(body.success).toBe(false);
    expect(body.errors[0]).toContain("storing every score this run");
    expect(body.scores_stored).toBe(1);
    expect(upserted(mock)).toHaveLength(1);
  });

  it("MATCH_STORE_MIN_SCORE=0 restores store-everything", async () => {
    process.env.MATCH_STORE_MIN_SCORE = "0";
    scoring.byJob = { p1: 1, p2: 2 };
    setup({
      job_seekers: { data: [seekerRow] },
      "job_posts:select": { data: [post("p1"), post("p2")] },
      "job_match_scores:select": paged([]),
    });
    expect((await (await call()).json()).scores_stored).toBe(2);
  });

  it("clamps an over-high MATCH_STORE_MIN_SCORE to 40 so a bad setting cannot drop displayed scores", async () => {
    process.env.MATCH_STORE_MIN_SCORE = "90";
    scoring.byJob = { p1: 45 };
    setup({
      job_seekers: { data: [seekerRow] },
      "job_posts:select": { data: [post("p1")] },
      "job_match_scores:select": paged([]),
    });
    expect((await (await call()).json()).scores_stored).toBe(1);
  });
});

// ─── prune ───────────────────────────────────────────────────────────

describe("POST /api/ops/prune-low-matches", () => {
  const call = (body?: unknown) =>
    prune(new Request("http://localhost/api/ops/prune-low-matches", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }));

  const lowRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, job_seeker_id: "s1", job_post_id: `p${i}` }));

  /** Delete stub: returns the ids that were asked for, like a successful DELETE ... RETURNING. */
  const deleteEcho = (call: RecordedCall) => {
    const ids = call.filters.find((f) => f.method === "in")?.args[1] as string[];
    return { data: ids.map((id) => ({ id })) };
  };

  it("requires ops authorization", async () => {
    ops.auth = { ok: false, error: "Not authorized." };
    const mock = setup();
    expect((await call({ confirm: true })).status).toBe(401);
    expect(mock.calls).toHaveLength(0);
  });

  it("is a dry run by default: reports what it would delete and deletes nothing", async () => {
    const mock = setup({
      "application_queue:select": paged([]),
      "job_match_scores:select": { data: lowRows(10) },
    });
    const body = await (await call()).json();
    expect(body).toMatchObject({ dry_run: true, floor: 40, scanned: 10, would_delete: 10, kept_for_queue: 0 });
    expect(mock.callsFor("job_match_scores", "delete")).toHaveLength(0);
  });

  it("only treats confirm === true as confirmation", async () => {
    const mock = setup({ "application_queue:select": paged([]), "job_match_scores:select": { data: lowRows(3) } });
    for (const confirm of ["true", 1]) expect((await (await call({ confirm })).json()).dry_run).toBe(true);
    expect(mock.callsFor("job_match_scores", "delete")).toHaveLength(0);
  });

  it("keeps any pair that has ever had a queue item", async () => {
    const mock = setup({
      "application_queue:select": paged([{ job_seeker_id: "s1", job_post_id: "p1" }, { job_seeker_id: "s1", job_post_id: "p2" }]),
      "job_match_scores:select": { data: lowRows(5) },
      "job_match_scores:delete": deleteEcho,
    });
    const body = await (await call({ confirm: true })).json();
    expect(body).toMatchObject({ scanned: 5, deleted: 3, kept_for_queue: 2 });
    const deletedIds = mock.callsFor("job_match_scores", "delete").flatMap((c) => c.filters.find((f) => f.method === "in")!.args[1] as string[]);
    expect(deletedIds).toEqual(["id0", "id3", "id4"]); // p1 and p2 are protected
  });

  it("deletes in chunks of 500 and re-checks the score at delete time", async () => {
    const mock = setup({
      "application_queue:select": paged([]),
      "job_match_scores:select": { data: lowRows(1200) },
      "job_match_scores:delete": deleteEcho,
    });
    const body = await (await call({ confirm: true })).json();
    expect(body).toMatchObject({ dry_run: false, deleted: 1200, failed_chunks: 0, success: true });

    const deletes = mock.callsFor("job_match_scores", "delete");
    expect(deletes).toHaveLength(3); // 500 + 500 + 200
    // A row rescored upward since the read must not be deleted.
    for (const d of deletes) expect(filteredOn(d, "lt", "score", 40)).toBe(true);
  });

  it("clamps the floor to 40 so it can never delete a score that a screen displays", async () => {
    const mock = setup({ "application_queue:select": paged([]), "job_match_scores:select": { data: [] } });
    await call({ min_score: 90 });
    await call({ min_score: 25 });
    const floors = mock.callsFor("job_match_scores", "select").map((c) => c.filters.find((f) => f.method === "lt")?.args[1]);
    expect(floors).toEqual([40, 25]);
  });

  it("does nothing, and reads nothing, when the floor is 0", async () => {
    const mock = setup();
    const body = await (await call({ confirm: true, min_score: 0 })).json();
    expect(body.matched).toBe(0);
    expect(mock.calls).toHaveLength(0);
  });

  it("refuses to delete anything if the queue lookup fails", async () => {
    const mock = setup({ "application_queue:select": { error: { message: "boom" } }, "job_match_scores:select": { data: lowRows(5) } });
    const res = await call({ confirm: true });
    expect(res.status).toBe(500);
    expect(mock.callsFor("job_match_scores", "delete")).toHaveLength(0);
  });

  it("500s if the score lookup fails", async () => {
    const mock = setup({ "application_queue:select": paged([]), "job_match_scores:select": { error: { message: "boom" } } });
    expect((await call({ confirm: true })).status).toBe(500);
    expect(mock.callsFor("job_match_scores", "delete")).toHaveLength(0);
  });

  it("reports a failed chunk but keeps going", async () => {
    let n = 0;
    setup({
      "application_queue:select": paged([]),
      "job_match_scores:select": { data: lowRows(1100) },
      "job_match_scores:delete": (c: RecordedCall) => (++n === 1 ? { error: { message: "timeout" } } : deleteEcho(c)),
    });
    const body = await (await call({ confirm: true })).json();
    expect(body).toMatchObject({ success: false, failed_chunks: 1, deleted: 600 });
  });

  it("clamps the limit and reports has_more only while progress is being made", async () => {
    const mock = setup({
      "application_queue:select": paged([]),
      "job_match_scores:select": { data: lowRows(20000) },
      "job_match_scores:delete": deleteEcho,
    });
    const body = await (await call({ confirm: true, limit: 999999 })).json();
    const limit = mock.callsFor("job_match_scores", "select")[0].filters.find((f) => f.method === "limit")?.args[0];
    expect(limit).toBe(20000);
    expect(body.has_more).toBe(true);
  });
});
