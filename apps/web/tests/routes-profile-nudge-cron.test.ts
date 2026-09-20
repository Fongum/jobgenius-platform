// ============================================================
// GET /api/cron/profile-nudge
//
// Regressions covered:
//   - it skipped the auth check entirely when CRON_SECRET was unset, so an
//     unauthenticated caller could make it email every seeker;
//   - it logged to cron_runs with job_name/summary columns that the table
//     (migration 058) does not have, so the audit row never saved;
//   - a failed send was neither counted as sent nor as an error.
//
// See tests/helpers/supabase-mock.ts on what a recording fake can and cannot prove.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, filteredOn, type ResultMap } from "./helpers/supabase-mock";

const db = vi.hoisted(() => ({ current: null as unknown }));
const send = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  get supabaseAdmin() {
    return (db.current as { client: unknown }).client;
  },
}));
vi.mock("@/lib/messaging/send-and-log", () => ({ sendAndLogEmail: send.fn }));

import { GET } from "@/app/api/cron/profile-nudge/route";

// Columns that actually exist on public.cron_runs (migration 058).
const CRON_RUNS_COLUMNS = new Set([
  "id",
  "started_at",
  "completed_at",
  "status",
  "triggered_by",
  "fetched",
  "inserted",
  "errors",
  "source_counts",
  "error_message",
]);

function setup(results: ResultMap = {}) {
  const mock = createSupabaseMock({ "cron_runs:insert": { data: null }, ...results });
  db.current = mock;
  return mock;
}

function call(headers: Record<string, string> = { "x-vercel-cron": "1" }) {
  return GET(new NextRequest("http://localhost/api/cron/profile-nudge", { headers }));
}

const seekers = [
  { id: "s1", full_name: "Ann", email: "ann@example.com", profile_completion: 20 },
  { id: "s2", full_name: "Bo", email: "bo@example.com", profile_completion: 60 },
  { id: "s3", full_name: "Cy", email: "cy@example.com", profile_completion: 40 },
];

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  send.fn.mockReset().mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("authorization", () => {
  it("rejects an unauthenticated call when CRON_SECRET is unset (was fail-open) and touches nothing", async () => {
    const mock = setup({ job_seekers: { data: seekers } });
    const res = await call({});
    expect(res.status).toBe(401);
    expect(mock.calls).toHaveLength(0);
    expect(send.fn).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "s3cret";
    setup({ job_seekers: { data: seekers } });
    expect((await call({})).status).toBe(401);
    expect((await call({ authorization: "Bearer nope" })).status).toBe(401);
    expect((await call({ authorization: "s3cret" })).status).toBe(401);
    expect(send.fn).not.toHaveBeenCalled();
  });

  it("accepts the correct bearer secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    setup({ job_seekers: { data: [] } });
    expect((await call({ authorization: "Bearer s3cret" })).status).toBe(200);
  });

  it("accepts the Vercel cron header, like the sibling crons", async () => {
    setup({ job_seekers: { data: [] } });
    expect((await call({ "x-vercel-cron": "1" })).status).toBe(200);
  });
});

describe("nudging", () => {
  it("emails eligible seekers and skips anyone nudged in the last 7 days", async () => {
    const mock = setup({
      job_seekers: { data: seekers },
      email_logs: { data: [{ job_seeker_id: "s2" }] },
    });
    const body = await (await call()).json();
    expect(body).toMatchObject({ sent: 2, eligible: 2, total_found: 3, errors: 0 });

    const recipients = send.fn.mock.calls.map((c) => (c[0] as { job_seeker_id: string }).job_seeker_id);
    expect(recipients).toEqual(["s1", "s3"]);
    expect(send.fn.mock.calls[0][0]).toMatchObject({ template_key: "profile_completion_nudge", to: "ann@example.com" });

    const seekerQuery = mock.callsFor("job_seekers", "select")[0];
    expect(filteredOn(seekerQuery, "eq", "status", "active")).toBe(true);
    expect(filteredOn(seekerQuery, "lt", "profile_completion", 80)).toBe(true);
  });

  it("links to NEXT_PUBLIC_SITE_URL when NEXT_PUBLIC_APP_URL is unset (production sets only SITE_URL)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example";
    setup({ job_seekers: { data: [seekers[0]] }, email_logs: { data: [] } });
    await call();
    expect((send.fn.mock.calls[0][0] as { html: string }).html).toContain("https://site.example/portal/profile");
  });

  it("prefers NEXT_PUBLIC_APP_URL when both are set", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example";
    setup({ job_seekers: { data: [seekers[0]] }, email_logs: { data: [] } });
    await call();
    expect((send.fn.mock.calls[0][0] as { html: string }).html).toContain("https://app.example/portal/profile");
  });
});

describe("audit logging (public.cron_runs)", () => {
  it("writes only columns that exist on the table", async () => {
    const mock = setup({ job_seekers: { data: seekers }, email_logs: { data: [] } });
    await call();
    const row = mock.payloadFor("cron_runs", "insert") as Record<string, unknown>;
    for (const key of Object.keys(row)) expect(CRON_RUNS_COLUMNS.has(key)).toBe(true);
    expect(row).not.toHaveProperty("job_name");
    expect(row).not.toHaveProperty("summary");
    expect(row).toMatchObject({
      status: "success",
      triggered_by: "vercel-cron",
      fetched: 3,
      inserted: 3,
      errors: 0,
      source_counts: { profile_nudge: 3, eligible: 3 },
    });
    expect(row.started_at).toBeTruthy();
    expect(row.completed_at).toBeTruthy();
  });

  it("logs a success row with zeros when there is nobody to nudge", async () => {
    const mock = setup({ job_seekers: { data: [] } });
    const body = await (await call()).json();
    expect(body).toEqual({ sent: 0 });
    expect(mock.payloadFor("cron_runs", "insert")).toMatchObject({ status: "success", fetched: 0, inserted: 0 });
  });

  it("counts a send that returns ok:false as an error, and only successes as inserted", async () => {
    send.fn
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const mock = setup({ job_seekers: { data: seekers }, email_logs: { data: [] } });
    const body = await (await call()).json();
    expect(body).toMatchObject({ sent: 2, errors: 1 });
    const row = mock.payloadFor("cron_runs", "insert") as Record<string, unknown>;
    expect(row).toMatchObject({ status: "error", inserted: 2, errors: 1 });
    expect(row.error_message).toContain("s2: send failed");
  });

  it("records a thrown send as an error and keeps going", async () => {
    send.fn.mockRejectedValueOnce(new Error("EMAIL_FROM_ADDRESS is required")).mockResolvedValue({ ok: true });
    const mock = setup({ job_seekers: { data: seekers }, email_logs: { data: [] } });
    const body = await (await call()).json();
    expect(body).toMatchObject({ sent: 2, errors: 1 });
    expect(send.fn).toHaveBeenCalledTimes(3);
    expect((mock.payloadFor("cron_runs", "insert") as { status: string }).status).toBe("error");
  });

  it("returns 500 and logs an error row if the seeker lookup fails", async () => {
    const mock = setup({ job_seekers: { error: { message: "db down" } } });
    const res = await call();
    expect(res.status).toBe(500);
    expect(mock.payloadFor("cron_runs", "insert")).toMatchObject({ status: "error", errors: 1 });
    expect(send.fn).not.toHaveBeenCalled();
  });

  it("does not fail the response if the audit insert itself fails", async () => {
    setup({
      job_seekers: { data: [seekers[0]] },
      email_logs: { data: [] },
      "cron_runs:insert": { error: { message: "nope" } },
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).sent).toBe(1);
  });
});
