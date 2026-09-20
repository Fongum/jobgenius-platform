// ============================================================
// POST /api/apply/screenshot and POST /api/apply/next now authenticate.
//
// Both were open behind lib/api-guard.ts, which only checks that some credential
// is PRESENT:
//   - /apply/screenshot accepted any request with an Authorization or x-runner
//     header (present, not validated) and wrote to the runner-screenshots bucket;
//   - /apply/next had no check at all and advanced or failed application runs.
// The static manifest in api-route-auth.test.ts is what found them; this file
// tests the fixes. See tests/helpers/supabase-mock.ts for the fake's limits.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSupabaseMock, filteredOn, type ResultMap } from "./helpers/supabase-mock";

const db = vi.hoisted(() => ({ current: null as unknown }));
const am = vi.hoisted(() => ({
  /** getAccountManagerFromRequest result. */
  who: { accountManager: { id: "am-1", name: "AM", email: "am@example.com" } } as
    | { accountManager: { id: string; name: string | null; email: string } }
    | { error: string },
  hasAccess: vi.fn(async () => true),
  requireAccess: vi.fn(),
}));
const upload = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return (db.current as { client: unknown }).client;
  },
}));
vi.mock("@/lib/auth", () => ({
  get supabaseAdmin() {
    return (db.current as { client: unknown }).client;
  },
}));
vi.mock("@/lib/am-access", () => ({
  getAccountManagerFromRequest: async () => am.who,
  hasJobSeekerAccess: am.hasAccess,
  requireAMAccessToSeeker: am.requireAccess,
}));

import { POST as screenshot } from "@/app/api/apply/screenshot/route";
import { POST as nextStep } from "@/app/api/apply/next/route";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SEEKER = "seeker-1";

function setup(results: ResultMap = {}) {
  const mock = createSupabaseMock(results);
  // The screenshot route uploads through supabaseAdmin.storage.
  Object.assign(mock.client, {
    storage: { from: () => ({ upload: upload.fn }) },
  });
  db.current = mock;
  return mock;
}

beforeEach(() => {
  am.who = { accountManager: { id: "am-1", name: "AM", email: "am@example.com" } };
  am.hasAccess.mockReset().mockResolvedValue(true);
  am.requireAccess.mockReset();
  upload.fn.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => vi.restoreAllMocks());

// ─── /apply/screenshot ───────────────────────────────────────────────

describe("POST /api/apply/screenshot", () => {
  function post(fields: { run_id?: string; bytes?: number; withFile?: boolean } = {}, headers: Record<string, string> = {}) {
    const fd = new FormData();
    if (fields.withFile !== false) {
      fd.set("file", new Blob([new Uint8Array(fields.bytes ?? 1024)], { type: "image/png" }), "shot.png");
    }
    if (fields.run_id !== undefined) fd.set("run_id", fields.run_id);
    fd.set("step", "SUBMIT");
    fd.set("reason", "PROOF");
    fd.set("url", "https://jobs.example/apply");
    return screenshot(new Request("http://localhost/api/apply/screenshot", { method: "POST", body: fd, headers }));
  }

  const runFound = { application_runs: { data: { id: RUN_ID, job_seeker_id: SEEKER } } };

  it("rejects a request that merely carries an Authorization / x-runner header but is not authenticated", async () => {
    // Previously this exact request was accepted: presence, not validity, was checked.
    am.who = { error: "Invalid token." };
    const mock = setup(runFound);
    const res = await post({ run_id: RUN_ID }, { authorization: "Bearer not-a-real-token", "x-runner": "cloud" });
    expect(res.status).toBe(401);
    expect(upload.fn).not.toHaveBeenCalled();
    expect(mock.calls).toHaveLength(0);
  });

  it("rejects a request with no credentials at all", async () => {
    am.who = { error: "Not authenticated." };
    setup(runFound);
    expect((await post({ run_id: RUN_ID })).status).toBe(401);
    expect(upload.fn).not.toHaveBeenCalled();
  });

  it("404s for a run that does not exist, and uploads nothing", async () => {
    const mock = setup({ application_runs: { data: null } });
    const res = await post({ run_id: RUN_ID });
    expect(res.status).toBe(404);
    expect(upload.fn).not.toHaveBeenCalled();
    expect(mock.callsFor("apply_run_screenshots", "insert")).toHaveLength(0);
  });

  it("403s when the authenticated caller has no access to the run's seeker", async () => {
    am.hasAccess.mockResolvedValue(false);
    const mock = setup(runFound);
    const res = await post({ run_id: RUN_ID });
    expect(res.status).toBe(403);
    expect(am.hasAccess).toHaveBeenCalledWith("am-1", SEEKER);
    expect(upload.fn).not.toHaveBeenCalled();
    expect(mock.callsFor("apply_run_screenshots", "insert")).toHaveLength(0);
  });

  it("rejects an arbitrary run_id (e.g. a path traversal string) because the run must exist", async () => {
    const mock = setup({ application_runs: { data: null } });
    const res = await post({ run_id: "../../other-bucket/evil" });
    expect(res.status).toBe(404);
    expect(upload.fn).not.toHaveBeenCalled();
    const lookup = mock.callsFor("application_runs", "select")[0];
    expect(filteredOn(lookup, "eq", "id", "../../other-bucket/evil")).toBe(true);
  });

  it("rejects an oversized upload before touching storage", async () => {
    setup(runFound);
    const res = await post({ run_id: RUN_ID, bytes: 10 * 1024 * 1024 + 1 });
    expect(res.status).toBe(413);
    expect(upload.fn).not.toHaveBeenCalled();
  });

  it("requires a file and a run_id", async () => {
    setup(runFound);
    expect((await post({ run_id: RUN_ID, withFile: false })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("uploads and records the screenshot for an authorised caller", async () => {
    const mock = setup(runFound);
    const res = await post({ run_id: RUN_ID }, { authorization: "Bearer real", "x-runner": "cloud" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.path).toMatch(new RegExp(`^${RUN_ID}/\\d+\\.png$`));

    expect(upload.fn).toHaveBeenCalledTimes(1);
    expect(upload.fn.mock.calls[0][0]).toBe(body.path);
    expect(mock.payloadFor("apply_run_screenshots", "insert")).toMatchObject({
      run_id: RUN_ID,
      step: "SUBMIT",
      reason: "PROOF",
      screenshot_path: body.path,
    });
    expect(am.hasAccess).toHaveBeenCalledWith("am-1", SEEKER);
  });
});

// ─── /apply/next ─────────────────────────────────────────────────────

describe("POST /api/apply/next", () => {
  const post = (body: unknown) =>
    nextStep(new Request("http://localhost/api/apply/next", { method: "POST", body: JSON.stringify(body) }));

  const payload = { run_id: RUN_ID, step: "FILL_FORM", success: true };
  const run = {
    id: RUN_ID,
    queue_id: "q1",
    job_seeker_id: SEEKER,
    ats_type: "GREENHOUSE",
    status: "RUNNING",
    current_step: "OPEN_PAGE", // differs from payload.step: only reached once past the access gate
    step_attempts: 0,
    total_attempts: 0,
    max_step_retries: 2,
  };

  const denied = (status: number, error: string) => ({
    ok: false as const,
    response: Response.json({ success: false, error }, { status }),
  });

  it("rejects an unauthenticated caller and changes nothing (it had no authentication at all)", async () => {
    am.requireAccess.mockResolvedValue(denied(401, "Not authenticated."));
    const mock = setup({ application_runs: { data: run } });
    const res = await post(payload);
    expect(res.status).toBe(401);
    for (const table of ["application_step_events", "apply_run_events", "application_queue", "attention_items"]) {
      expect(mock.callsFor(table)).toHaveLength(0);
    }
    expect(mock.callsFor("application_runs", "update")).toHaveLength(0);
  });

  it("rejects an authenticated caller who has no access to the run's seeker", async () => {
    am.requireAccess.mockResolvedValue(denied(403, "Access denied."));
    const mock = setup({ application_runs: { data: run } });
    expect((await post(payload)).status).toBe(403);
    expect(mock.callsFor("application_step_events")).toHaveLength(0);
  });

  it("checks access against the RUN'S seeker, and only then applies the step logic", async () => {
    am.requireAccess.mockResolvedValue({ ok: true, amId: "am-1", amEmail: "am@example.com" });
    setup({ application_runs: { data: run } });
    const res = await post(payload);
    // Past the gate, the step mismatch is what stops it — proving auth comes first.
    expect(res.status).toBe(409);
    expect(am.requireAccess).toHaveBeenCalledTimes(1);
    expect(am.requireAccess.mock.calls[0][1]).toBe(SEEKER);
  });

  it("selects job_seeker_id so the access check has something to check", async () => {
    am.requireAccess.mockResolvedValue(denied(401, "no"));
    const mock = setup({ application_runs: { data: run } });
    await post(payload);
    const select = mock.callsFor("application_runs", "select")[0];
    expect(String(select.filters[0].args[0])).toContain("job_seeker_id");
  });

  it("still 404s for an unknown run and 400s for a malformed body", async () => {
    setup({ application_runs: { data: null, error: { message: "not found" } } });
    expect((await post(payload)).status).toBe(404);
    expect((await post({ run_id: RUN_ID })).status).toBe(400);
  });
});
