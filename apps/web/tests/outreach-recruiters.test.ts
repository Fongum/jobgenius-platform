// ============================================================
// Recruiter identity and per-thread stage (migration 123).
//
// Two production bugs these pin down:
//   - Duplicate recruiters per email broke the lookups (and the opt-out check
//     hanging off one of them). find-or-create must normalize, and must
//     recover from losing the insert race to the unique index.
//   - Pipeline stage was written to the shared recruiters row, so one AM's
//     "CLOSED" closed the recruiter for every seeker. Stage changes must land
//     on the thread, and automatic events must never move a stage backwards.
//
// The SQL half (merge, trigger, unique index, backfill) needs a real
// database; it was verified against Postgres 15 separately. See
// tests/helpers/supabase-mock.ts for what a mocked client can and can't show.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filteredOn, type SupabaseMock } from "./helpers/supabase-mock";

const db = vi.hoisted(() => ({ current: null as unknown }));
const am = vi.hoisted(() => ({ current: null as unknown }));
const optedOut = vi.hoisted(() => ({ ids: new Set<string>() }));
const sentTo = vi.hoisted(() => ({ list: [] as string[] }));

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return (db.current as SupabaseMock).client;
  },
}));

vi.mock("@/lib/am-access", () => ({
  getAccountManagerFromRequest: async () => am.current,
  hasJobSeekerAccess: async () => true,
}));

vi.mock("@/lib/ops-auth", () => ({
  requireOpsAuth: () => ({ ok: false }),
}));

vi.mock("@/lib/outreach-consent", () => ({
  assertOutreachConsent: async () => ({ ok: true }),
  getRecruiterOptOut: async (id: string) => ({
    optedOut: optedOut.ids.has(id),
    error: null,
  }),
}));

vi.mock("@/lib/email/adapter", () => ({
  getOutreachAdapter: async () => ({
    adapter: {
      sendEmail: async ({ to }: { to: string[] }) => {
        sentTo.list.push(...to);
        return { ok: true, provider_message_id: "pm-1" };
      },
    },
    fromEmail: "seeker@job-genius.com",
    provider: "stub",
  }),
}));

import {
  advanceThreadStage,
  findOrCreateRecruiter,
  isOutreachStage,
  normalizeRecruiterEmail,
  recordOutboundContact,
  stagesBefore,
} from "@/lib/outreach-recruiters";
import { PATCH as patchStage } from "@/app/api/outreach/threads/[id]/stage/route";
import { POST as sendBatch } from "@/app/api/outreach/send-batch/route";

function use(mock: SupabaseMock) {
  db.current = mock;
  return mock;
}

beforeEach(() => {
  optedOut.ids.clear();
  sentTo.list = [];
  am.current = { accountManager: { id: "am-1" } };
});

describe("normalizeRecruiterEmail", () => {
  it("trims and lowercases, matching the DB trigger", () => {
    expect(normalizeRecruiterEmail("  Jane@Acme.COM ")).toBe("jane@acme.com");
  });

  it("treats blank as no email", () => {
    expect(normalizeRecruiterEmail("   ")).toBeNull();
    expect(normalizeRecruiterEmail(null)).toBeNull();
  });
});

describe("stagesBefore", () => {
  it("lets an automatic event only move a thread forward", () => {
    expect(stagesBefore("CONTACTED")).toEqual(["NEW"]);
    expect(stagesBefore("ENGAGED")).toEqual(["NEW", "CONTACTED"]);
    expect(stagesBefore("INTERVIEWING")).toEqual(["NEW", "CONTACTED", "ENGAGED"]);
  });

  it("never reopens or overwrites anything to reach CLOSED automatically", () => {
    expect(stagesBefore("CLOSED")).toEqual([]);
    expect(stagesBefore("NEW")).toEqual([]);
  });

  it("isOutreachStage rejects anything else", () => {
    expect(isOutreachStage("ENGAGED")).toBe(true);
    expect(isOutreachStage("engaged")).toBe(false);
    expect(isOutreachStage(undefined)).toBe(false);
  });
});

describe("findOrCreateRecruiter", () => {
  it("finds an existing recruiter by normalized email without inserting", async () => {
    const mock = use(createSupabaseMock({ recruiters: { data: [{ id: "rec-1" }] } }));

    const result = await findOrCreateRecruiter({ email: " Jane@Acme.com", source: "test" });

    expect(result).toEqual({ ok: true, id: "rec-1", created: false });
    expect(filteredOn(mock.callsFor("recruiters", "select")[0], "eq", "email", "jane@acme.com")).toBe(true);
    expect(mock.callsFor("recruiters", "insert")).toHaveLength(0);
  });

  it("inserts with the normalized email when none exists", async () => {
    const mock = use(
      createSupabaseMock({
        "recruiters:select": { data: null },
        "recruiters:insert": { data: { id: "rec-new" } },
      })
    );

    const result = await findOrCreateRecruiter({ email: "Bob@Corp.com", name: "Bob", source: "test" });

    expect(result).toEqual({ ok: true, id: "rec-new", created: true });
    expect(mock.payloadFor("recruiters", "insert")).toMatchObject({
      email: "bob@corp.com",
      name: "Bob",
      status: "NEW",
    });
  });

  it("uses the winning row when a concurrent request inserted first (23505)", async () => {
    let selects = 0;
    use(
      createSupabaseMock({
        // First read: nobody yet. Re-read after the conflict: the winner.
        "recruiters:select": () => (selects++ === 0 ? { data: null } : { data: [{ id: "rec-winner" }] }),
        "recruiters:insert": { data: null, error: { code: "23505", message: "duplicate key" } },
      })
    );

    const result = await findOrCreateRecruiter({ email: "race@corp.com", source: "test" });

    expect(result).toEqual({ ok: true, id: "rec-winner", created: false });
  });

  it("reports other insert errors instead of inventing an id", async () => {
    use(
      createSupabaseMock({
        "recruiters:select": { data: null },
        "recruiters:insert": { data: null, error: { code: "42501", message: "denied" } },
      })
    );

    const result = await findOrCreateRecruiter({ email: "x@corp.com", source: "test" });

    expect(result).toEqual({ ok: false, error: "denied" });
  });

  it("refuses a blank email", async () => {
    const mock = use(createSupabaseMock());
    expect(await findOrCreateRecruiter({ email: "  ", source: "test" })).toMatchObject({ ok: false });
    expect(mock.calls).toHaveLength(0);
  });
});

describe("stage writes", () => {
  it("advanceThreadStage only updates threads still earlier in the pipeline", async () => {
    const mock = use(createSupabaseMock());

    await advanceThreadStage("t-1", "ENGAGED", "2026-10-02T00:00:00.000Z");

    const [update] = mock.callsFor("recruiter_threads", "update");
    expect(update.payload).toMatchObject({ stage: "ENGAGED" });
    expect(filteredOn(update, "eq", "id", "t-1")).toBe(true);
    expect(update.filters).toContainEqual({ method: "in", args: ["stage", ["NEW", "CONTACTED"]] });
  });

  it("recordOutboundContact never overwrites a recruiter status other than NEW", async () => {
    const mock = use(createSupabaseMock());

    await recordOutboundContact({ recruiterId: "rec-1", threadId: "t-1", nowIso: "2026-10-02T00:00:00.000Z" });

    const recruiterUpdates = mock.callsFor("recruiters", "update");
    const statusWrites = recruiterUpdates.filter(
      (call) => (call.payload as Record<string, unknown>).status !== undefined
    );
    expect(statusWrites).toHaveLength(1);
    expect(filteredOn(statusWrites[0], "eq", "status", "NEW")).toBe(true);

    const [threadUpdate] = mock.callsFor("recruiter_threads", "update");
    expect(threadUpdate.payload).toMatchObject({ stage: "CONTACTED" });
    expect(threadUpdate.filters).toContainEqual({ method: "in", args: ["stage", ["NEW"]] });
  });
});

describe("PATCH /api/outreach/threads/[id]/stage", () => {
  function patch(body: unknown) {
    return patchStage(
      new Request("http://localhost/api/outreach/threads/t-1/stage", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      { params: { id: "t-1" } }
    );
  }

  const thread = {
    id: "t-1",
    recruiter_id: "rec-shared",
    job_seeker_id: "seeker-a",
    interview_started_at: null,
    offer_received_at: null,
    closed_at: null,
  };

  it("closing a recruiter for one seeker writes the thread, not the shared recruiter", async () => {
    const mock = use(createSupabaseMock({ "recruiter_threads:select": { data: thread } }));

    const response = await patch({ recruiter_status: "CLOSED" });

    expect(response.status).toBe(200);
    expect(mock.callsFor("recruiters", "update")).toHaveLength(0);
    const [update] = mock.callsFor("recruiter_threads", "update");
    expect(update.payload).toMatchObject({ stage: "CLOSED", thread_status: "CLOSED" });
    expect(filteredOn(update, "eq", "id", "t-1")).toBe(true);
  });

  it("marking an interview moves only this thread to INTERVIEWING", async () => {
    const mock = use(createSupabaseMock({ "recruiter_threads:select": { data: thread } }));

    await patch({ mark_interview: true });

    expect(mock.callsFor("recruiters", "update")).toHaveLength(0);
    expect(mock.payloadFor("recruiter_threads", "update")).toMatchObject({ stage: "INTERVIEWING" });
  });

  it("rejects an unknown stage", async () => {
    use(createSupabaseMock({ "recruiter_threads:select": { data: thread } }));
    const response = await patch({ recruiter_status: "WON" });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/outreach/send-batch", () => {
  function batchData(recruiterId: string) {
    return createSupabaseMock({
      job_seeker_assignments: { data: [{ job_seeker_id: "seeker-a" }] },
      "outreach_drafts:select": {
        data: [
          {
            id: "d-1",
            job_seeker_id: "seeker-a",
            job_post_id: "jp-1",
            subject: "Hello",
            body: "Body",
            status: "draft",
            contact_id: "c-1",
            outreach_contacts: {
              id: "c-1",
              full_name: "Jane",
              email: "Jane@Acme.com",
              role: "TA",
              company_name: "Acme",
            },
          },
        ],
      },
      "recruiters:select": { data: [{ id: recruiterId }] },
      "recruiter_threads:select": { data: [{ id: "t-1" }] },
      "outreach_messages:insert": { data: { id: "m-1" } },
    });
  }

  function send() {
    return sendBatch(
      new Request("http://localhost/api/outreach/send-batch", {
        method: "POST",
        body: JSON.stringify({ all_pending: true }),
      })
    );
  }

  it("skips a recruiter who opted out instead of emailing them", async () => {
    optedOut.ids.add("rec-optout");
    const mock = use(batchData("rec-optout"));

    const body = await (await send()).json();

    expect(body).toMatchObject({ sent: 0, skipped: 1 });
    expect(sentTo.list).toEqual([]);
    expect(mock.callsFor("outreach_messages", "insert")).toHaveLength(0);
  });

  it("matches the recruiter by normalized email and advances only the thread", async () => {
    const mock = use(batchData("rec-1"));

    const body = await (await send()).json();

    expect(body).toMatchObject({ sent: 1 });
    expect(filteredOn(mock.callsFor("recruiters", "select")[0], "eq", "email", "jane@acme.com")).toBe(true);
    expect(mock.callsFor("recruiters", "insert")).toHaveLength(0);
    const stageUpdate = mock
      .callsFor("recruiter_threads", "update")
      .find((call) => (call.payload as Record<string, unknown>).stage === "CONTACTED");
    expect(stageUpdate).toBeDefined();
  });
});
