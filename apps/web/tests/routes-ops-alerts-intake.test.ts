// ============================================================
// GET/POST /api/ops/alerts/run — the intake-aging rule.
//
// Production had 7 seekers pending review for up to 55 days and 5 approved
// seekers awaiting payment for 116 days, with nothing monitoring or telling
// anyone. Runs the real route and the real aging policy against a recording
// Supabase fake. See tests/helpers/supabase-mock.ts for its limits.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, filteredOn, type RecordedCall, type ResultMap } from "./helpers/supabase-mock";

const db = vi.hoisted(() => ({ current: null as unknown }));
const ops = vi.hoisted(() => ({ auth: { ok: true } as { ok: boolean; error?: string } }));

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return (db.current as { client: unknown }).client;
  },
}));
vi.mock("@/lib/ops-auth", () => ({ requireOpsAuth: () => ops.auth }));
vi.mock("@/lib/rate-limit-presets", () => ({
  enforceOpsRateLimit: async () => ({ allowed: true, remaining: 1 }),
}));

import { GET, POST } from "@/app/api/ops/alerts/run/route";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const pendingReview = (days: number) => ({ id: `r${days}`, status: "pending_review", submitted_at: daysAgo(days) });
const paymentPending = (days: number) => ({ id: `p${days}`, status: "approved_payment_pending", approved_at: daysAgo(days) });

function setup(results: ResultMap = {}) {
  const mock = createSupabaseMock({
    v_ops_kpis_hourly: { data: [] },
    runner_heartbeats: { data: [] },
    job_seeker_intake_states: { data: [] },
    "ops_alerts:select": { data: [] },
    // The route reads the inserted rows back (`.select(...)`) to notify Slack.
    "ops_alerts:insert": (call: RecordedCall) => ({
      data: (call.payload as Array<Record<string, unknown>>).map((row, i) => ({ id: `alert-${i}`, ...row })),
    }),
    ...results,
  });
  db.current = mock;
  return mock;
}

const insertedAlerts = (mock: ReturnType<typeof setup>) =>
  (mock.payloadFor("ops_alerts", "insert") as Array<Record<string, unknown>> | undefined) ?? [];

beforeEach(() => {
  ops.auth = { ok: true };
  delete process.env.INTAKE_REVIEW_SLA_DAYS;
  delete process.env.INTAKE_PAYMENT_SLA_DAYS;
  delete process.env.SLACK_WEBHOOK_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const run = () => GET(new Request("http://localhost/api/ops/alerts/run"));

describe("intake-aging rule", () => {
  it("raises one alert per overdue queue for the real backlog", async () => {
    const mock = setup({
      job_seeker_intake_states: {
        data: [pendingReview(11), pendingReview(55), paymentPending(116), paymentPending(116), { id: "x", status: "active_client", submitted_at: daysAgo(81) }],
      },
    });
    const body = await (await run()).json();
    expect(body.created).toBe(2);

    const alerts = insertedAlerts(mock);
    const review = alerts.find((a) => (a.meta as { scope: string }).scope === "review")!;
    const payment = alerts.find((a) => (a.meta as { scope: string }).scope === "payment")!;
    expect(review).toMatchObject({ type: "INTAKE_OVERDUE", severity: "HIGH" }); // oldest 55d > 3 x 3d
    expect(review.message).toBe("2 seekers awaiting intake review for more than 3 days (oldest: 55 days).");
    expect(payment).toMatchObject({ type: "INTAKE_OVERDUE", severity: "HIGH" });
    expect((payment.meta as { overdue: number }).overdue).toBe(2);
  });

  it("only reads the statuses that are waiting on a human", async () => {
    const mock = setup();
    await run();
    const query = mock.callsFor("job_seeker_intake_states", "select")[0];
    expect(query.filters.find((f) => f.method === "in")?.args).toEqual([
      "status",
      ["submitted", "pending_review", "call_completed", "approved_payment_pending"],
    ]);
  });

  it("raises nothing when every queue is on target", async () => {
    const mock = setup({ job_seeker_intake_states: { data: [pendingReview(1), paymentPending(2)] } });
    const body = await (await run()).json();
    expect(body).toEqual({ success: true, created: 0 });
    expect(mock.callsFor("ops_alerts", "insert")).toHaveLength(0);
  });

  it("uses MEDIUM until the oldest item is over three times the target", async () => {
    const mock = setup({ job_seeker_intake_states: { data: [pendingReview(5)] } });
    await run();
    expect(insertedAlerts(mock)[0]).toMatchObject({ severity: "MEDIUM" });
  });

  it("respects the SLA env overrides", async () => {
    process.env.INTAKE_REVIEW_SLA_DAYS = "60";
    const mock = setup({ job_seeker_intake_states: { data: [pendingReview(55)] } });
    expect((await (await run()).json()).created).toBe(0);
    expect(mock.callsFor("ops_alerts", "insert")).toHaveLength(0);
  });

  it("does not duplicate an unresolved alert for the same queue on the next run", async () => {
    const mock = setup({
      job_seeker_intake_states: { data: [pendingReview(20), paymentPending(20)] },
      "ops_alerts:select": {
        data: [{ id: "open", type: "INTAKE_OVERDUE", meta: { scope: "review" }, resolved_at: null }],
      },
    });
    const body = await (await run()).json();
    expect(body.created).toBe(1);
    expect((insertedAlerts(mock)[0].meta as { scope: string }).scope).toBe("payment");
  });

  it("does not let an unresolved alert for one queue suppress the other", async () => {
    setup({
      job_seeker_intake_states: { data: [paymentPending(20)] },
      "ops_alerts:select": {
        data: [{ id: "open", type: "INTAKE_OVERDUE", meta: { scope: "review" }, resolved_at: null }],
      },
    });
    expect((await (await run()).json()).created).toBe(1);
  });

  it("posts HIGH alerts to Slack and not MEDIUM ones", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.example/slack";
    const slack = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", slack);

    setup({ job_seeker_intake_states: { data: [pendingReview(5), paymentPending(116)] } }); // review MEDIUM, payment HIGH
    await run();
    expect(slack).toHaveBeenCalledTimes(1);
    const text = JSON.parse((slack.mock.calls[0] as unknown as [string, { body: string }])[1].body).text as string;
    expect(text).toContain("INTAKE_OVERDUE");
    expect(text).toContain("awaiting payment");
  });

  it("does not let a failing intake lookup suppress the other alerts", async () => {
    const mock = setup({
      job_seeker_intake_states: { error: { message: "boom" } },
      runner_heartbeats: { data: [{ runner_id: "runner-1", ts: daysAgo(1) }] }, // stale heartbeat
    });
    const body = await (await run()).json();
    expect(body.created).toBe(1);
    expect(insertedAlerts(mock)[0]).toMatchObject({ type: "RUNNER_HEARTBEAT_STALE" });
  });

  it("still works via POST and still requires ops authorization", async () => {
    setup({ job_seeker_intake_states: { data: [pendingReview(20)] } });
    expect((await (await POST(new Request("http://localhost/api/ops/alerts/run", { method: "POST" }))).json()).created).toBe(1);

    ops.auth = { ok: false, error: "Not authorized." };
    const mock = setup({ job_seeker_intake_states: { data: [pendingReview(20)] } });
    expect((await run()).status).toBe(401);
    expect(mock.calls).toHaveLength(0);
  });

  it("scopes the alert lookup to unresolved alerts", async () => {
    const mock = setup({ job_seeker_intake_states: { data: [pendingReview(20)] } });
    await run();
    const lookup = mock.callsFor("ops_alerts", "select")[0];
    expect(filteredOn(lookup, "is", "resolved_at")).toBe(true);
  });
});
