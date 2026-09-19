// ============================================================
// AI provider outage handling — wiring
//
//   lib/ops-alerts.ts                      alert dedupe + Slack
//   POST /api/ops/queue/requeue-ai-blocked recovery of parked items
//   GET  /api/background/run               a job that fails with the real
//                                          production "no credits" error
//
// The last group replays the Aug–Sep 2026 incident through the real handler:
// before this change that failure burned 3 attempts and parked the queue item
// in NEEDS_ATTENTION forever with no alert. See tests/helpers/supabase-mock.ts
// for what a recording fake can and cannot prove.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, filteredOn, type RecordedCall, type ResultMap } from "./helpers/supabase-mock";

const db = vi.hoisted(() => ({ current: null as unknown }));
const ops = vi.hoisted(() => ({ auth: { ok: true } as { ok: boolean; error?: string } }));
const tailor = vi.hoisted(() => ({ structured: vi.fn(), plain: vi.fn() }));
// The route reads these flags at import time, so they must be set before it loads.
vi.hoisted(() => {
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.AUTO_TAILOR_ENABLED = "true";
});

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return (db.current as { client: unknown }).client;
  },
}));
// The background route's import graph reaches the real auth module, which reads env at load.
vi.mock("@/lib/auth", () => ({ supabaseAdmin: { from: () => ({}) } }));
vi.mock("@/lib/ops-auth", () => ({ requireOpsAuth: () => ops.auth }));
vi.mock("@/lib/rate-limit-presets", () => ({
  enforceOpsRateLimit: async () => ({ allowed: true, remaining: 1 }),
  enforceBackgroundRateLimit: async () => ({ allowed: true, remaining: 1 }),
}));
vi.mock("@/lib/openai", () => ({
  OPENAI_MODEL: "test-model",
  isOpenAIConfigured: () => true,
  getOpenAIClient: () => {
    throw new Error("should not be called");
  },
}));
vi.mock("@/lib/resume-tailor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resume-tailor")>()),
  tailorResumeStructured: tailor.structured,
  tailorResume: tailor.plain,
}));

import { raiseOpsAlert } from "@/lib/ops-alerts";
import { POST as requeue } from "@/app/api/ops/queue/requeue-ai-blocked/route";
import { GET as runBackground } from "@/app/api/background/run/route";

const PROD_QUOTA_ERROR =
  "429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.";

function setup(results: ResultMap = {}) {
  const mock = createSupabaseMock(results);
  db.current = mock;
  return mock;
}

beforeEach(() => {
  ops.auth = { ok: true };
  delete process.env.SLACK_WEBHOOK_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── raiseOpsAlert ───────────────────────────────────────────────────

describe("raiseOpsAlert", () => {
  const alert = { severity: "HIGH" as const, type: "AI_PROVIDER_QUOTA", message: "out of credits", meta: { a: 1 } };

  it("inserts an alert when none is unresolved", async () => {
    const mock = setup({ "ops_alerts:select": { data: [] } });
    const res = await raiseOpsAlert(alert);
    expect(res.created).toBe(true);
    expect(mock.payloadFor("ops_alerts", "insert")).toMatchObject({
      severity: "HIGH",
      type: "AI_PROVIDER_QUOTA",
      message: "out of credits",
      meta: { a: 1 },
    });
    const lookup = mock.callsFor("ops_alerts", "select")[0];
    expect(filteredOn(lookup, "eq", "type", "AI_PROVIDER_QUOTA")).toBe(true);
    expect(filteredOn(lookup, "is", "resolved_at")).toBe(true);
  });

  it("does not duplicate an unresolved alert of the same type", async () => {
    const mock = setup({ "ops_alerts:select": { data: [{ id: "existing" }] } });
    const res = await raiseOpsAlert(alert);
    expect(res.created).toBe(false);
    expect(mock.callsFor("ops_alerts", "insert")).toHaveLength(0);
  });

  it("posts HIGH alerts to Slack, but not lower severities", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.example/slack";
    const slack = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", slack);

    setup({ "ops_alerts:select": { data: [] } });
    await raiseOpsAlert(alert);
    expect(slack).toHaveBeenCalledTimes(1);
    expect(JSON.parse((slack.mock.calls[0] as unknown as [string, { body: string }])[1].body).text).toContain(
      "AI_PROVIDER_QUOTA"
    );

    slack.mockClear();
    await raiseOpsAlert({ ...alert, severity: "MEDIUM" });
    expect(slack).not.toHaveBeenCalled();
  });

  it("never throws, even if the database errors", async () => {
    setup({ "ops_alerts:select": { error: { message: "db down" } } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(raiseOpsAlert(alert)).resolves.toEqual({ created: false });
  });

  it("never throws if the insert fails or Slack is down", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.example/slack";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ "ops_alerts:select": { data: [] }, "ops_alerts:insert": { error: { message: "nope" } } });
    await expect(raiseOpsAlert(alert)).resolves.toEqual({ created: false });
  });
});

// ─── POST /api/ops/queue/requeue-ai-blocked ──────────────────────────

describe("POST /api/ops/queue/requeue-ai-blocked", () => {
  const call = (body?: unknown) =>
    requeue(
      new Request("http://localhost/api/ops/queue/requeue-ai-blocked", {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    );

  const blocked = { data: [{ id: "q1" }, { id: "q2" }, { id: "q3" }] };

  it("requires ops authorization", async () => {
    ops.auth = { ok: false, error: "Not authorized." };
    const mock = setup();
    const res = await call({ confirm: true });
    expect(res.status).toBe(401);
    expect(mock.calls).toHaveLength(0);
  });

  it("is a dry run by default: reports the match count and writes nothing", async () => {
    const mock = setup({ "application_queue:select": blocked });
    const res = await call(); // no body at all
    const body = await res.json();
    expect(body).toMatchObject({ success: true, dry_run: true, matched: 3 });
    expect(mock.callsFor("application_queue", "update")).toHaveLength(0);
    expect(mock.callsFor("attention_items")).toHaveLength(0);
  });

  it("only treats confirm === true as confirmation", async () => {
    const mock = setup({ "application_queue:select": blocked });
    for (const confirm of ["true", 1, "yes"]) {
      const body = await (await call({ confirm })).json();
      expect(body.dry_run).toBe(true);
    }
    expect(mock.callsFor("application_queue", "update")).toHaveLength(0);
  });

  it("selects only NEEDS_ATTENTION items whose error is a quota error", async () => {
    const mock = setup({ "application_queue:select": blocked });
    await call({});
    const query = mock.callsFor("application_queue", "select")[0];
    expect(filteredOn(query, "eq", "status", "NEEDS_ATTENTION")).toBe(true);
    const or = query.filters.find((f) => f.method === "or")?.args[0] as string;
    expect(or).toContain("last_error.ilike.*no credits remaining*");
    expect(or).toContain("last_error.ilike.*insufficient_quota*");
  });

  it("on confirm, resets the items to QUEUED (guarded by status) and resolves their attention rows", async () => {
    const mock = setup({
      "application_queue:select": blocked,
      "application_queue:update": { data: [{ id: "q1" }, { id: "q2" }, { id: "q3" }] },
    });
    const res = await call({ confirm: true });
    expect(await res.json()).toMatchObject({ success: true, dry_run: false, requeued: 3 });

    const update = mock.callsFor("application_queue", "update")[0] as RecordedCall;
    expect(update.payload).toMatchObject({ status: "QUEUED", category: "auto_matched", last_error: null });
    expect(filteredOn(update, "in", "id")).toBe(true);
    // A human who resolved an item in the meantime must not be overwritten.
    expect(filteredOn(update, "eq", "status", "NEEDS_ATTENTION")).toBe(true);

    const attention = mock.callsFor("attention_items", "update")[0];
    expect(attention.payload).toMatchObject({ status: "RESOLVED" });
    expect(filteredOn(attention, "eq", "status", "OPEN")).toBe(true);
  });

  it("only resolves attention rows for items that were actually requeued", async () => {
    const mock = setup({
      "application_queue:select": blocked,
      "application_queue:update": { data: [{ id: "q2" }] }, // q1, q3 were resolved by a human first
    });
    const body = await (await call({ confirm: true })).json();
    expect(body.requeued).toBe(1);
    const attention = mock.callsFor("attention_items", "update")[0];
    const inFilter = attention.filters.find((f) => f.method === "in");
    expect(inFilter?.args).toEqual(["queue_id", ["q2"]]);
  });

  it("does nothing when no items match", async () => {
    const mock = setup({ "application_queue:select": { data: [] } });
    const body = await (await call({ confirm: true })).json();
    expect(body).toMatchObject({ requeued: 0 });
    expect(mock.callsFor("application_queue", "update")).toHaveLength(0);
  });

  it("clamps the limit", async () => {
    const mock = setup({ "application_queue:select": { data: [] } });
    await call({ limit: 99999 });
    await call({ limit: -5 });
    await call({ limit: "abc" });
    const limits = mock
      .callsFor("application_queue", "select")
      .map((c) => c.filters.find((f) => f.method === "limit")?.args[0]);
    expect(limits).toEqual([500, 1, 200]);
  });

  it("500s if the lookup fails and does not write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mock = setup({ "application_queue:select": { error: { message: "boom" } } });
    const res = await call({ confirm: true });
    expect(res.status).toBe(500);
    expect(mock.callsFor("application_queue", "update")).toHaveLength(0);
  });
});

// ─── GET /api/background/run — the incident, replayed ────────────────
//
// A TAILOR_RESUME job carrying a queue item, failing with the exact error text
// found in 84 production rows. Before this change: 3 quick attempts, then the
// item was parked in NEEDS_ATTENTION forever, with no alert.

describe("GET /api/background/run when the AI provider is out of credits", () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const QUEUE_ID = "queue-1";

  function jobResults(
    job: { attempts: number; created_at: string },
    seeker: Record<string, unknown> = { resume_text: "Sam — 5 years of Postgres.", email: "sam@example.com" }
  ) {
    const row = {
      id: "job-1",
      type: "TAILOR_RESUME",
      payload: { queue_id: QUEUE_ID, job_seeker_id: "seeker-1", job_post_id: "post-1" },
      max_attempts: 3,
      ...job,
    };
    return {
      "background_jobs:select": { data: [row] },
      // The same table is updated twice: the lock (status RUNNING) returns the
      // job; the final write (RETRY/FAILED/DONE) returns nothing we read.
      "background_jobs:update": (call: RecordedCall) =>
        (call.payload as { status?: string })?.status === "RUNNING" ? { data: row } : { data: null },
      job_seekers: { data: seeker },
      job_posts: { data: { title: "Engineer", company: "Acme", description_text: "Build APIs." } },
      "ops_alerts:select": { data: [] },
    } satisfies ResultMap;
  }

  const finalJobWrite = (mock: ReturnType<typeof setup>) =>
    mock
      .callsFor("background_jobs", "update")
      .map((c) => c.payload as Record<string, unknown>)
      .find((p) => p.status !== "RUNNING") as Record<string, unknown>;

  const run = () => runBackground(new Request("http://localhost/api/background/run?limit=1"));

  beforeEach(() => {
    tailor.structured.mockReset().mockRejectedValue(new Error(PROD_QUOTA_ERROR));
    tailor.plain.mockReset().mockRejectedValue(new Error(PROD_QUOTA_ERROR));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("defers the job without consuming an attempt, and raises one alert", async () => {
    const mock = setup(jobResults({ attempts: 2, created_at: hoursAgo(1) })); // would have been its LAST attempt
    const before = Date.now();
    const res = await run();
    expect(res.status).toBe(200);

    const write = finalJobWrite(mock);
    expect(write).toMatchObject({ status: "RETRY", attempts: 2 });
    expect(write.last_error).toContain("no credits remaining");
    // ~30 minutes out, not the 4-minute backoff.
    expect(Date.parse(write.run_at as string) - before).toBeGreaterThan(29 * 60 * 1000);

    expect(mock.payloadFor("ops_alerts", "insert")).toMatchObject({
      severity: "HIGH",
      type: "AI_PROVIDER_QUOTA",
    });
  });

  it("does NOT park the queue item or open an attention row during the outage", async () => {
    const mock = setup(jobResults({ attempts: 2, created_at: hoursAgo(1) }));
    await run();
    expect(tailor.structured).toHaveBeenCalled(); // it really did take the incident path
    expect(tailor.plain).not.toHaveBeenCalled(); // and skipped the fallback: same exhausted account
    expect(mock.callsFor("application_queue", "update")).toHaveLength(0);
    expect(mock.callsFor("attention_items", "insert")).toHaveLength(0);
  });

  it("defers (rather than mislabelling as missing input) when the seeker has no résumé text", async () => {
    // Previously: structured tailoring hit the quota, the inner catch saw no
    // resume_text and parked the item as TAILOR_INPUT_MISSING. 4 production rows.
    const mock = setup(jobResults({ attempts: 0, created_at: hoursAgo(1) }, { resume_text: null, email: "sam@example.com" }));
    await run();
    expect(tailor.plain).not.toHaveBeenCalled();
    expect(finalJobWrite(mock)).toMatchObject({ status: "RETRY", attempts: 0 });
    expect(mock.callsFor("application_queue", "update")).toHaveLength(0);
    expect(mock.callsFor("attention_items", "insert")).toHaveLength(0);
  });

  it("does not raise a second alert while one is unresolved", async () => {
    const mock = setup({
      ...jobResults({ attempts: 0, created_at: hoursAgo(1) }),
      "ops_alerts:select": { data: [{ id: "already-open" }] },
    });
    await run();
    expect(mock.callsFor("ops_alerts", "insert")).toHaveLength(0);
  });

  it("gives up after the deferral window, then parks the item with the real error (dead key still surfaces)", async () => {
    const mock = setup(jobResults({ attempts: 2, created_at: hoursAgo(80) }));
    await run();
    expect(finalJobWrite(mock)).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(mock.callsFor("ops_alerts", "insert")).toHaveLength(0);

    const parked = mock.callsFor("application_queue", "update")[0];
    expect(parked.payload).toMatchObject({ status: "NEEDS_ATTENTION" });
    expect((parked.payload as { last_error: string }).last_error).toContain("no credits remaining");
    expect(mock.payloadFor("attention_items", "insert")).toMatchObject({ queue_id: QUEUE_ID, reason: "TAILOR_FAILED" });
  });

  it("is unchanged for ordinary failures: backoff, then park on the final attempt", async () => {
    tailor.structured.mockRejectedValue(new Error("model exploded"));
    tailor.plain.mockRejectedValue(new Error("model exploded"));

    const first = setup(jobResults({ attempts: 0, created_at: hoursAgo(1) }));
    await run();
    expect(finalJobWrite(first)).toMatchObject({ status: "RETRY", attempts: 1 });
    expect(first.callsFor("application_queue", "update")).toHaveLength(0);
    expect(first.callsFor("ops_alerts", "insert")).toHaveLength(0);

    const last = setup(jobResults({ attempts: 2, created_at: hoursAgo(1) }));
    await run();
    expect(finalJobWrite(last)).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(last.payloadFor("attention_items", "insert")).toMatchObject({ reason: "TAILOR_FAILED" });
  });
});
