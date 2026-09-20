// ============================================================
// Résumé → profile: the backfill route and the portal upload wiring.
//
// Production had 18 seekers with résumé text but only 3 with skills, 2 with work
// history and 3 with education. These tests run the real handlers, the real fill
// policy and the real completion calculator against a recording Supabase fake;
// only Supabase, OpenAI and the résumé parser are stubbed. It cannot prove SQL
// or RLS — see tests/helpers/supabase-mock.ts.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authAs, createSupabaseMock, filteredOn, type ResultMap } from "./helpers/supabase-mock";

const db = vi.hoisted(() => ({ current: null as unknown }));
const ops = vi.hoisted(() => ({ auth: { ok: true } as { ok: boolean; error?: string } }));
const authState = vi.hoisted(() => ({ current: null as unknown }));
const parser = vi.hoisted(() => ({ ai: vi.fn(), regex: vi.fn() }));
const openai = vi.hoisted(() => ({ configured: true, create: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return (db.current as { client: unknown }).client;
  },
}));
vi.mock("@/lib/auth", () => ({
  requireJobSeeker: async () => authState.current,
  get supabaseAdmin() {
    return (db.current as { client: unknown }).client;
  },
}));
vi.mock("@/lib/ops-auth", () => ({ requireOpsAuth: () => ops.auth }));
vi.mock("@/lib/rate-limit-presets", () => ({
  enforceOpsRateLimit: async () => ({ allowed: true, remaining: 1 }),
}));
vi.mock("@/lib/resume-parser", () => ({
  parseResumeWithAI: parser.ai,
  parseResumeText: parser.regex,
}));
vi.mock("@/lib/openai", () => ({
  OPENAI_MODEL: "test-model",
  isOpenAIConfigured: () => openai.configured,
  getOpenAIClient: () => ({ chat: { completions: { create: openai.create } } }),
}));

import { POST as backfill } from "@/app/api/ops/seekers/backfill-profile-from-resume/route";
import { POST as uploadResume } from "@/app/api/portal/resume/upload/route";

function setup(results: ResultMap = {}) {
  const mock = createSupabaseMock(results);
  db.current = mock;
  return mock;
}

const LONG_RESUME = "Sam Doe — Backend Engineer. ".repeat(20); // > 200 chars

const parsedFull = {
  phone: "5550100100",
  location: "Austin, TX",
  skills: ["Postgres", "TypeScript"],
  work_history: [{ title: "Backend Engineer", company: "Initech", start_date: "2021", end_date: "2024", current: false, description: "" }],
  education: [{ degree: "BSc", school: "State University", field: "CS", graduation_year: "2020" }],
};

beforeEach(() => {
  ops.auth = { ok: true };
  authState.current = authAs("seeker-1", "job_seeker");
  parser.ai.mockReset();
  parser.regex.mockReset().mockReturnValue({ skills: ["Regex Skill"] });
  openai.configured = true;
  openai.create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// ─── POST /api/ops/seekers/backfill-profile-from-resume ──────────────

describe("POST /api/ops/seekers/backfill-profile-from-resume", () => {
  const call = (body?: unknown) =>
    backfill(
      new Request("http://localhost/api/ops/seekers/backfill-profile-from-resume", {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    );

  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    full_name: "Sam",
    resume_text: LONG_RESUME,
    skills: [],
    work_history: [],
    education: [],
    ...overrides,
  });

  it("requires ops authorization", async () => {
    ops.auth = { ok: false, error: "Not authorized." };
    const mock = setup();
    const res = await call({ confirm: true });
    expect(res.status).toBe(401);
    expect(mock.calls).toHaveLength(0);
  });

  it("is a dry run by default: counts candidates, makes no AI calls and writes nothing", async () => {
    const mock = setup({
      "job_seekers:select": {
        data: [
          row("a"),
          row("b", { skills: ["x"], work_history: [{ title: "t" }], education: [{ degree: "d" }] }), // complete: not a candidate
          row("c", { resume_text: "too short" }), // no usable résumé
          row("d", { skills: ["x"] }),
        ],
      },
    });
    const body = await (await call()).json();
    expect(body).toMatchObject({
      dry_run: true,
      candidates: 2,
      would_process: 2,
      missing: { skills: 1, work_history: 2, education: 2 },
    });
    expect(parser.ai).not.toHaveBeenCalled();
    expect(mock.callsFor("job_seekers", "update")).toHaveLength(0);
  });

  it("only treats confirm === true as confirmation", async () => {
    const mock = setup({ "job_seekers:select": { data: [row("a")] } });
    for (const confirm of ["true", 1]) {
      expect((await (await call({ confirm })).json()).dry_run).toBe(true);
    }
    expect(mock.callsFor("job_seekers", "update")).toHaveLength(0);
  });

  it("on confirm, fills the empty fields, recomputes completion and reports AI vs fallback", async () => {
    parser.ai.mockResolvedValue(parsedFull);
    const mock = setup({ "job_seekers:select": { data: [row("a")] } });

    const body = await (await call({ confirm: true })).json();
    expect(body).toMatchObject({
      dry_run: false,
      processed: 1,
      updated: 1,
      failed: 0,
      parsed_by: { ai: 1, regex_fallback: 0 },
      has_more: false,
    });
    expect(body.filled_fields).toMatchObject({ skills: 1, work_history: 1, education: 1 });
    expect(body.hint).toBeUndefined();

    const update = mock.callsFor("job_seekers", "update")[0];
    expect(update.payload).toMatchObject({
      skills: ["Postgres", "TypeScript"],
      phone: "5550100100",
    });
    expect(typeof (update.payload as { profile_completion: unknown }).profile_completion).toBe("number");
    expect(filteredOn(update, "eq", "id", "a")).toBe(true);
  });

  it("never overwrites a field that already has a value", async () => {
    parser.ai.mockResolvedValue(parsedFull);
    const mock = setup({ "job_seekers:select": { data: [row("a", { skills: ["Rust"] })] } });
    await call({ confirm: true });
    const payload = mock.payloadFor("job_seekers", "update") as Record<string, unknown>;
    expect(payload).not.toHaveProperty("skills");
    expect(payload).toHaveProperty("work_history");
  });

  it("warns when AI is unavailable and only the regex fallback ran", async () => {
    parser.ai.mockResolvedValue(null);
    const mock = setup({ "job_seekers:select": { data: [row("a")] } });
    const body = await (await call({ confirm: true })).json();
    expect(body.parsed_by).toEqual({ ai: 0, regex_fallback: 1 });
    expect(body.hint).toMatch(/OpenAI billing/);
    // The fallback can still fill skills, but not work history / education.
    const payload = mock.payloadFor("job_seekers", "update") as Record<string, unknown>;
    expect(payload.skills).toEqual(["Regex Skill"]);
    expect(payload).not.toHaveProperty("work_history");
  });

  it("counts seekers with nothing new to fill as unchanged, without writing", async () => {
    parser.ai.mockResolvedValue({ full_name: "Sam" }); // nothing fillable
    const mock = setup({ "job_seekers:select": { data: [row("a")] } });
    const body = await (await call({ confirm: true })).json();
    expect(body).toMatchObject({ updated: 0, unchanged: 1 });
    expect(mock.callsFor("job_seekers", "update")).toHaveLength(0);
  });

  it("isolates failures: one bad seeker does not stop the batch", async () => {
    parser.ai.mockRejectedValueOnce(new Error("parser exploded")).mockResolvedValue(parsedFull);
    const mock = setup({ "job_seekers:select": { data: [row("bad"), row("good")] } });
    const body = await (await call({ confirm: true })).json();
    expect(body).toMatchObject({ processed: 2, updated: 1, failed: 1 });
    expect(mock.callsFor("job_seekers", "update")).toHaveLength(1);
  });

  it("counts a failed database update as failed, not updated", async () => {
    parser.ai.mockResolvedValue(parsedFull);
    setup({
      "job_seekers:select": { data: [row("a")] },
      "job_seekers:update": { error: { message: "boom" } },
    });
    const body = await (await call({ confirm: true })).json();
    expect(body).toMatchObject({ updated: 0, failed: 1 });
  });

  it("respects the limit and reports has_more", async () => {
    parser.ai.mockResolvedValue(parsedFull);
    setup({ "job_seekers:select": { data: [row("a"), row("b"), row("c")] } });
    const body = await (await call({ confirm: true, limit: 2 })).json();
    expect(body).toMatchObject({ candidates: 3, processed: 2, has_more: true });
    expect(parser.ai).toHaveBeenCalledTimes(2);
  });

  it("clamps the limit to 1..50", async () => {
    parser.ai.mockResolvedValue(parsedFull);
    setup({ "job_seekers:select": { data: Array.from({ length: 80 }, (_, i) => row(`s${i}`)) } });
    expect((await (await call({ confirm: true, limit: 9999 })).json()).processed).toBe(50);
    expect((await (await call({ confirm: true, limit: -3 })).json()).processed).toBe(1);
  });

  it("500s if the lookup fails and does not write", async () => {
    const mock = setup({ "job_seekers:select": { error: { message: "boom" } } });
    const res = await call({ confirm: true });
    expect(res.status).toBe(500);
    expect(mock.callsFor("job_seekers", "update")).toHaveLength(0);
  });
});

// ─── POST /api/portal/resume/upload ──────────────────────────────────

describe("POST /api/portal/resume/upload persists what it parses", () => {
  const storage = {
    listBuckets: async () => ({ data: [{ id: "resumes" }] }),
    createBucket: async () => ({}),
    from: () => ({
      upload: async () => ({ data: {}, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: "https://signed.example/r" }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "https://public.example/r" } }),
    }),
  };

  function upload(text = LONG_RESUME) {
    const fd = new FormData();
    fd.set("file", new File([text], "resume.txt", { type: "text/plain" }));
    return uploadResume(new Request("http://localhost/api/portal/resume/upload", { method: "POST", body: fd }));
  }

  function withStorage(results: ResultMap) {
    const mock = setup(results);
    Object.assign(mock.client, { storage });
    return mock;
  }

  const emptySeekerRow = { id: "seeker-1", full_name: "Sam", skills: [], work_history: [], education: [], phone: null };

  const aiReturns = (payload: unknown) =>
    openai.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(payload) } }] });

  it("saves parsed skills, work history and education server-side, and recomputes completion", async () => {
    aiReturns(parsedFull);
    const mock = withStorage({
      job_seeker_documents: { data: { id: "doc-1" } },
      "job_seekers:update": { data: emptySeekerRow },
    });

    const res = await upload();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.profile_filled.sort()).toEqual(["education", "location", "phone", "skills", "work_history"]);

    // The résumé itself is still saved first...
    const updates = mock.callsFor("job_seekers", "update");
    expect(updates[0].payload).toMatchObject({ resume_url: "https://signed.example/r" });
    // ...then the parsed fields, with a recomputed completion in the same write.
    const fillWrite = updates.at(-1)!.payload as Record<string, unknown>;
    expect(fillWrite).toMatchObject({ skills: ["Postgres", "TypeScript"], phone: "5550100100" });
    expect(fillWrite.profile_completion as number).toBeGreaterThan(0);
    expect(filteredOn(updates.at(-1)!, "eq", "id", "seeker-1")).toBe(true);
  });

  it("does not overwrite fields the seeker already has", async () => {
    aiReturns(parsedFull);
    const mock = withStorage({
      job_seeker_documents: { data: { id: "doc-1" } },
      "job_seekers:update": { data: { ...emptySeekerRow, skills: ["Rust"], phone: "111" } },
    });
    const body = await (await upload()).json();
    expect(body.profile_filled).not.toContain("skills");
    expect(body.profile_filled).not.toContain("phone");
    const fillWrite = mock.callsFor("job_seekers", "update").at(-1)!.payload as Record<string, unknown>;
    expect(fillWrite).not.toHaveProperty("skills");
    expect(fillWrite).not.toHaveProperty("phone");
  });

  it("still returns the parsed profile to the client (existing contract)", async () => {
    aiReturns(parsedFull);
    withStorage({
      job_seeker_documents: { data: { id: "doc-1" } },
      "job_seekers:update": { data: emptySeekerRow },
    });
    const body = await (await upload()).json();
    expect(body.parsed_profile).toMatchObject({ skills: ["Postgres", "TypeScript"] });
    expect(body.document).toMatchObject({ id: "doc-1" });
  });

  it("falls back to the regex parser when OpenAI is unavailable and fills what it can", async () => {
    openai.configured = false;
    const mock = withStorage({
      job_seeker_documents: { data: { id: "doc-1" } },
      "job_seekers:update": { data: emptySeekerRow },
    });
    const body = await (await upload(`Sam Doe\nAustin, TX\nSkills: Postgres, TypeScript, Go\n${LONG_RESUME}`)).json();
    expect(body.profile_filled).toContain("skills");
    expect(body.profile_filled).not.toContain("work_history"); // regex cannot extract it
    expect(mock.callsFor("job_seekers", "update").at(-1)!.payload).toMatchObject({
      skills: ["Postgres", "TypeScript", "Go"],
    });
  });

  it("does not fail the upload if saving the parsed fields fails", async () => {
    aiReturns(parsedFull);
    let n = 0;
    withStorage({
      job_seeker_documents: { data: { id: "doc-1" } },
      // First update (résumé url) succeeds; the parsed-fields update fails.
      "job_seekers:update": () => (++n === 1 ? { data: emptySeekerRow } : { error: { message: "boom" } }),
    });
    const res = await upload();
    expect(res.status).toBe(201);
    expect((await res.json()).profile_filled).toEqual([]);
  });

  it("writes nothing extra when the parse yields nothing new", async () => {
    aiReturns({ full_name: "Sam" });
    const mock = withStorage({
      job_seeker_documents: { data: { id: "doc-1" } },
      "job_seekers:update": { data: emptySeekerRow },
    });
    const body = await (await upload()).json();
    expect(body.profile_filled).toEqual([]);
    // Only the résumé-url write and the initial completion write; no third "fill" write.
    expect(mock.callsFor("job_seekers", "update")).toHaveLength(2);
  });
});
