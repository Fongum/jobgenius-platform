// ============================================================
// Live voice mock interview — route handlers
//
//   POST /voice-session               daily cap, session creation
//   POST /realtime-token              session binding, burst limit, OpenAI mint
//   POST /voice-session/[id]/complete transcript pairing, evaluator, 093 columns
//
// These routes have had no live traffic yet (0 rows in
// voice_interview_sessions), so this is the only thing that has ever
// executed them end to end. It runs the real handlers, the real quota
// policy and the real evaluator (heuristic path) against a recording fake
// of Supabase; only Supabase, OpenAI's HTTP endpoint and the rate-limit
// backend are stubbed. It cannot prove SQL, CHECK constraints or RLS — see
// tests/helpers/supabase-mock.ts.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authAs, createSupabaseMock, filteredOn, type ResultMap } from "./helpers/supabase-mock";

const auth = vi.hoisted(() => ({ current: null as unknown }));
const db = vi.hoisted(() => ({ current: null as unknown }));
const rateLimit = vi.hoisted(() => ({
  fn: vi.fn(async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 })),
}));
const logActivity = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
const loadContext = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  requireJobSeeker: async () => auth.current,
  get supabaseAdmin() {
    return (db.current as { client: unknown }).client;
  },
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: rateLimit.fn }));
vi.mock("@/lib/feedback-loop", () => ({ logActivity: logActivity.fn }));
vi.mock("@/lib/voice/service", () => ({ resolveAssignedAccountManagerId: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  OPENAI_MODEL: "test-model",
  isOpenAIConfigured: () => false, // force the heuristic evaluator: no network
  getOpenAIClient: () => {
    throw new Error("not configured");
  },
}));
vi.mock("@/lib/portal/interview-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal/interview-context")>()),
  loadInterviewContext: loadContext.fn,
}));

import { POST as createSession } from "@/app/api/portal/interview-prep/[id]/voice-session/route";
import { POST as mintToken } from "@/app/api/portal/interview-prep/[id]/realtime-token/route";
import { POST as completeSession } from "@/app/api/portal/interview-prep/[id]/voice-session/[sessionId]/complete/route";

const PREP_ID = "prep-1";
const SEEKER = "seeker-1";
const SESSION_ID = "sess-1";

const seeker = () => authAs(SEEKER, "job_seeker");
const anonymous = { authenticated: false as const, error: "Unauthorized", status: 401 };

function setup(results: ResultMap = {}) {
  const mock = createSupabaseMock(results);
  db.current = mock;
  return mock;
}

function post(url: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

beforeEach(() => {
  auth.current = seeker();
  rateLimit.fn.mockClear();
  logActivity.fn.mockClear();
  loadContext.fn.mockReset();
  vi.stubEnv("VOICE_PREP_DAILY_SESSIONS", "3");
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ─── POST /voice-session ─────────────────────────────────────────────

describe("POST /voice-session", () => {
  const call = (body?: unknown) =>
    createSession(post(`/api/portal/interview-prep/${PREP_ID}/voice-session`, body), {
      params: { id: PREP_ID },
    });

  it("rejects unauthenticated callers without touching the database", async () => {
    auth.current = anonymous;
    const mock = setup();
    const res = await call({ persona: "technical" });
    expect(res.status).toBe(401);
    expect(mock.calls).toHaveLength(0);
  });

  it("404s when the prep does not belong to the seeker", async () => {
    const mock = setup({ interview_prep: { data: null } });
    const res = await call({});
    expect(res.status).toBe(404);
    const prepLookup = mock.callsFor("interview_prep", "select")[0];
    expect(filteredOn(prepLookup, "eq", "job_seeker_id", SEEKER)).toBe(true);
    expect(mock.callsFor("voice_interview_sessions", "insert")).toHaveLength(0);
  });

  it("creates an in-progress session for the seeker when under the cap", async () => {
    const mock = setup({
      interview_prep: { data: { id: PREP_ID } },
      "voice_interview_sessions:select": {
        data: [{ created_at: hoursAgo(1) }, { created_at: hoursAgo(30) }],
      },
      "voice_interview_sessions:insert": { data: { id: SESSION_ID, status: "in_progress" } },
    });
    const res = await call({ persona: "stress" });
    expect(res.status).toBe(201);
    expect(mock.payloadFor("voice_interview_sessions", "insert")).toMatchObject({
      interview_prep_id: PREP_ID,
      job_seeker_id: SEEKER,
      interviewer_persona: "stress",
      status: "in_progress",
    });
  });

  it("defaults an unknown persona rather than passing it to the CHECK constraint", async () => {
    const mock = setup({
      interview_prep: { data: { id: PREP_ID } },
      "voice_interview_sessions:select": { data: [] },
      "voice_interview_sessions:insert": { data: { id: SESSION_ID } },
    });
    await call({ persona: "drill-sergeant" });
    expect(mock.payloadFor("voice_interview_sessions", "insert")).toMatchObject({
      interviewer_persona: "professional",
    });
  });

  it("returns 429 with Retry-After at the daily cap and creates nothing", async () => {
    const mock = setup({
      interview_prep: { data: { id: PREP_ID } },
      "voice_interview_sessions:select": {
        data: [
          { created_at: hoursAgo(20) },
          { created_at: hoursAgo(5) },
          { created_at: hoursAgo(1) },
        ],
      },
    });
    const res = await call({});
    expect(res.status).toBe(429);
    // Oldest session (20h ago) frees a slot in 4h.
    expect(Number(res.headers.get("Retry-After"))).toBe(4 * 3600);
    const body = await res.json();
    expect(body.code).toBe("DAILY_CAP_REACHED");
    expect(mock.callsFor("voice_interview_sessions", "insert")).toHaveLength(0);
  });

  it("counts the seeker's sessions across all preps within 24h", async () => {
    const mock = setup({
      interview_prep: { data: { id: PREP_ID } },
      "voice_interview_sessions:select": { data: [] },
      "voice_interview_sessions:insert": { data: { id: SESSION_ID } },
    });
    await call({});
    const quotaQuery = mock.callsFor("voice_interview_sessions", "select")[0];
    expect(filteredOn(quotaQuery, "eq", "job_seeker_id", SEEKER)).toBe(true);
    expect(filteredOn(quotaQuery, "eq", "interview_prep_id")).toBe(false);
    expect(filteredOn(quotaQuery, "gte", "created_at")).toBe(true);
  });

  it("cap 0 pauses voice practice", async () => {
    vi.stubEnv("VOICE_PREP_DAILY_SESSIONS", "0");
    const mock = setup({
      interview_prep: { data: { id: PREP_ID } },
      "voice_interview_sessions:select": { data: [] },
    });
    const res = await call({});
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("PAUSED");
    expect(mock.callsFor("voice_interview_sessions", "insert")).toHaveLength(0);
  });

  it("fails closed (500, no session) if the quota lookup errors", async () => {
    const mock = setup({
      interview_prep: { data: { id: PREP_ID } },
      "voice_interview_sessions:select": { error: { message: "db down" } },
    });
    const res = await call({});
    expect(res.status).toBe(500);
    expect(mock.callsFor("voice_interview_sessions", "insert")).toHaveLength(0);
  });
});

// ─── POST /realtime-token ────────────────────────────────────────────

describe("POST /realtime-token", () => {
  const openAiFetch = vi.fn();
  const call = (body?: unknown) =>
    mintToken(post(`/api/portal/interview-prep/${PREP_ID}/realtime-token`, body), {
      params: { id: PREP_ID },
    });

  const freshSession = () => ({
    id: SESSION_ID,
    status: "in_progress",
    started_at: new Date(Date.now() - 20_000).toISOString(),
  });

  beforeEach(() => {
    openAiFetch.mockReset();
    openAiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ client_secret: { value: "ek_test", expires_at: 1234 } }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", openAiFetch);
    loadContext.fn.mockResolvedValue({
      job: { title: "Backend Engineer", company: "Acme", description: "Build APIs." },
      candidate: { fullName: "Sam", skills: ["Postgres"], workHistory: [], education: [] },
      hasResume: true,
    });
  });

  it("requires a session_id and never calls OpenAI without one", async () => {
    setup();
    const res = await call({ persona: "professional" });
    expect(res.status).toBe(400);
    expect(openAiFetch).not.toHaveBeenCalled();
  });

  it("scopes the session lookup to this prep and this seeker", async () => {
    const mock = setup({ voice_interview_sessions: { data: freshSession() } });
    await call({ session_id: SESSION_ID });
    const lookup = mock.callsFor("voice_interview_sessions", "select")[0];
    expect(filteredOn(lookup, "eq", "id", SESSION_ID)).toBe(true);
    expect(filteredOn(lookup, "eq", "interview_prep_id", PREP_ID)).toBe(true);
    expect(filteredOn(lookup, "eq", "job_seeker_id", SEEKER)).toBe(true);
  });

  it.each([
    ["does not exist / belongs to someone else", null],
    ["is stale", { ...freshSession(), started_at: hoursAgo(1) }],
    ["is already completed", { ...freshSession(), status: "completed" }],
  ])("409s when the session %s, without calling OpenAI", async (_label, row) => {
    setup({ voice_interview_sessions: { data: row } });
    const res = await call({ session_id: SESSION_ID });
    expect(res.status).toBe(409);
    expect(openAiFetch).not.toHaveBeenCalled();
  });

  it("429s on the burst limit before calling OpenAI", async () => {
    setup({ voice_interview_sessions: { data: freshSession() } });
    rateLimit.fn.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 42 });
    const res = await call({ session_id: SESSION_ID });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(openAiFetch).not.toHaveBeenCalled();
    expect(rateLimit.fn).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: SEEKER, scope: "portal-realtime-token" })
    );
  });

  it("mints a token with résumé-grounded instructions on the happy path", async () => {
    setup({ voice_interview_sessions: { data: freshSession() } });
    const res = await call({ session_id: SESSION_ID, persona: "technical" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("ek_test");
    expect(body.resume_grounded).toBe(true);
    expect(body.instructions).toContain("Backend Engineer");

    expect(openAiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = openAiFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/realtime/sessions");
    expect(JSON.parse(init.body).instructions).toBe(body.instructions);
    expect(init.headers.Authorization).toBe("Bearer sk-test");
  });

  it("404s (after the session checks) when the prep context cannot be loaded", async () => {
    setup({ voice_interview_sessions: { data: freshSession() } });
    loadContext.fn.mockResolvedValue(null);
    const res = await call({ session_id: SESSION_ID });
    expect(res.status).toBe(404);
    expect(openAiFetch).not.toHaveBeenCalled();
  });

  it("surfaces an OpenAI failure as 500 without leaking a token", async () => {
    setup({ voice_interview_sessions: { data: freshSession() } });
    openAiFetch.mockResolvedValue(new Response("upstream boom", { status: 502 }));
    const res = await call({ session_id: SESSION_ID });
    expect(res.status).toBe(500);
    expect((await res.json()).token).toBeUndefined();
  });
});

// ─── POST /voice-session/[sessionId]/complete ────────────────────────

describe("POST /voice-session/[sessionId]/complete", () => {
  const call = (body?: unknown) =>
    completeSession(
      post(`/api/portal/interview-prep/${PREP_ID}/voice-session/${SESSION_ID}/complete`, body),
      { params: { id: PREP_ID, sessionId: SESSION_ID } }
    );

  const session = { id: SESSION_ID, interview_prep_id: PREP_ID, interviewer_persona: "behavioral" };
  const strong =
    "Our checkout API timed out under load. I owned the fix, added connection pooling and caching, " +
    "and cut p95 latency by 62%, saving $40k a year.";
  const transcript = [
    { speaker: "interviewer", content: "Tell me about a hard technical problem." },
    { speaker: "candidate", content: strong },
    { speaker: "interviewer", content: "How do you prioritize?" },
    { speaker: "candidate", content: "I just do what seems important." },
  ];

  beforeEach(() => {
    loadContext.fn.mockResolvedValue({
      job: { title: "Backend Engineer", company: "Acme", description: null },
      candidate: { fullName: "Sam", skills: [], workHistory: [], education: [] },
      hasResume: true,
    });
  });

  function happyDb(extra: ResultMap = {}) {
    return setup({
      "voice_interview_sessions:select": { data: session },
      "voice_interview_sessions:update": { data: { ...session, status: "completed" } },
      "voice_interview_turns:select": { data: [] },
      ...extra,
    });
  }

  it("404s for a session that is not this seeker's", async () => {
    const mock = setup({ "voice_interview_sessions:select": { data: null } });
    const res = await call({ turns: transcript });
    expect(res.status).toBe(404);
    const lookup = mock.callsFor("voice_interview_sessions", "select")[0];
    expect(filteredOn(lookup, "eq", "job_seeker_id", SEEKER)).toBe(true);
    expect(filteredOn(lookup, "eq", "interview_prep_id", PREP_ID)).toBe(true);
  });

  it("400s on an empty or whitespace-only transcript and writes nothing", async () => {
    const mock = happyDb();
    const res = await call({ turns: [{ speaker: "candidate", content: "   " }] });
    expect(res.status).toBe(400);
    expect(mock.callsFor("voice_interview_turns")).toHaveLength(0);
    expect(mock.callsFor("voice_interview_sessions", "update")).toHaveLength(0);
  });

  it("400s on invalid JSON", async () => {
    happyDb();
    const res = await completeSession(
      new Request("http://localhost/x", { method: "POST", body: "{nope" }),
      { params: { id: PREP_ID, sessionId: SESSION_ID } }
    );
    expect(res.status).toBe(400);
  });

  it("replaces old turns, then stores each answer paired with its question and scored", async () => {
    const mock = happyDb();
    const res = await call({ turns: transcript });
    expect(res.status).toBe(200);

    // Old turns are cleared before the new ones are inserted (idempotent re-complete).
    const order = mock.calls
      .filter((c) => c.table === "voice_interview_turns" && (c.op === "delete" || c.op === "insert"))
      .map((c) => c.op);
    expect(order).toEqual(["delete", "insert"]);

    const rows = mock.payloadFor("voice_interview_turns", "insert") as Array<
      Record<string, unknown>
    >;
    expect(rows.map((r) => [r.turn_number, r.speaker])).toEqual([
      [0, "interviewer"],
      [1, "candidate"],
      [2, "interviewer"],
      [3, "candidate"],
    ]);
    // Interviewer turns carry no score; candidate turns carry the 093 columns.
    expect(rows[0].score).toBeUndefined();
    for (const r of [rows[1], rows[3]]) {
      for (const key of ["score", "star_score", "relevance_score", "specificity_score"]) {
        expect(typeof r[key]).toBe("number");
      }
      expect(typeof r.feedback).toBe("string");
      expect(Array.isArray(r.rewrite_suggestions)).toBe(true);
    }
    // The structured answer outscores the vague one.
    expect(rows[1].score as number).toBeGreaterThan(rows[3].score as number);
  });

  it("writes the 093 session fields and marks heuristic scoring", async () => {
    const mock = happyDb();
    await call({ turns: transcript });
    const update = mock.payloadFor("voice_interview_sessions", "update") as Record<string, unknown>;
    expect(update).toMatchObject({
      status: "completed",
      total_turns: 4,
      scored_by: "heuristic",
      resume_grounded: true,
    });
    expect(typeof update.overall_score).toBe("number");
    expect(typeof update.am_coaching_note).toBe("string");
    expect((update.feedback_report as { competencies: unknown }).competencies).toBeDefined();
    expect(update.completed_at).toBeTruthy();
  });

  it("surfaces the result to the AM timeline as mock_interview_completed", async () => {
    happyDb();
    await call({ turns: transcript });
    expect(logActivity.fn).toHaveBeenCalledTimes(1);
    const [seekerId, event] = logActivity.fn.mock.calls[0] as unknown as [
      string,
      { eventType: string; refId: string; meta: Record<string, unknown> },
    ];
    expect(seekerId).toBe(SEEKER);
    expect(event.eventType).toBe("mock_interview_completed");
    expect(event.refId).toBe(SESSION_ID);
    expect(event.meta).toMatchObject({ persona: "behavioral", scored_by: "heuristic" });
  });

  it("still completes if the activity log fails", async () => {
    happyDb();
    logActivity.fn.mockRejectedValueOnce(new Error("feed down"));
    const res = await call({ turns: transcript });
    expect(res.status).toBe(200);
  });

  it("stores a transcript with no candidate answers but leaves scores null and skips the AM event", async () => {
    const mock = happyDb();
    await call({ turns: [{ speaker: "interviewer", content: "Welcome — tell me about yourself." }] });
    const update = mock.payloadFor("voice_interview_sessions", "update") as Record<string, unknown>;
    expect(update.overall_score).toBeNull();
    expect(update.feedback_report).toBeNull();
    expect(logActivity.fn).not.toHaveBeenCalled();
  });

  it("500s if the transcript insert fails, before marking the session completed", async () => {
    const mock = happyDb({ "voice_interview_turns:insert": { error: { message: "boom" } } });
    const res = await call({ turns: transcript });
    expect(res.status).toBe(500);
    expect(mock.callsFor("voice_interview_sessions", "update")).toHaveLength(0);
  });
});
