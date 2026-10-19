// ============================================================
// Activity-credited attendance (migration 127).
//
// The cases here are the real failure shapes from production's first two
// months: shifts never signed out, a sign-in just after midnight counted
// as a 17-hour day, and the next morning's work leaking into a shift
// somebody forgot to close.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ACTIVITY_GRACE_MINUTES,
  activityBlocks,
  creditedMs,
  creditedWorkedMs,
  decideForgottenSignOut,
  lastActivityAt,
  suggestedSignOutAt,
  unresolvedShifts,
  workedMs,
  type AttendanceDay,
} from "@/lib/attendance";
import { attachActivity, recordActivity } from "@/lib/attendance-activity";
import {
  authAs,
  createSupabaseMock,
  filteredOn,
  type ResultMap,
} from "./helpers/supabase-mock";

const H = 3_600_000;
const M = 60_000;

/** Signed in 09:00 WAT (08:00 UTC) on Tue 13 Oct, never signed out. */
function shift(overrides: Partial<AttendanceDay> = {}): AttendanceDay {
  return {
    id: "day-1",
    account_manager_id: "am-1",
    work_date: "2026-10-13",
    signed_in_at: "2026-10-13T08:00:00Z",
    signed_out_at: null,
    breaks: [],
    ...overrides,
  };
}

const session = (start: string, end: string) => ({ started_at: start, last_seen_at: end });

/** The morning after, 10:00 WAT. */
const NEXT_MORNING = new Date("2026-10-14T09:00:00Z");

describe("activityBlocks", () => {
  it("joins sessions up to an hour apart and adds the grace period", () => {
    const blocks = activityBlocks([
      session("2026-10-13T08:00:00Z", "2026-10-13T10:00:00Z"),
      session("2026-10-13T10:50:00Z", "2026-10-13T12:00:00Z"), // 50m gap: joined
      session("2026-10-13T14:00:00Z", "2026-10-13T15:00:00Z"), // 2h gap: split
    ]);
    expect(blocks).toHaveLength(2);
    expect(new Date(blocks[0][1]).toISOString()).toBe(
      new Date(Date.parse("2026-10-13T12:00:00Z") + ACTIVITY_GRACE_MINUTES * M).toISOString()
    );
  });

  it("ignores malformed sessions", () => {
    expect(activityBlocks([session("nope", "2026-10-13T10:00:00Z")])).toEqual([]);
    expect(
      activityBlocks([session("2026-10-13T10:00:00Z", "2026-10-13T09:00:00Z")])
    ).toEqual([]);
  });
});

describe("credited time", () => {
  it("stops a forgotten sign-out at the last activity instead of dropping the day", () => {
    const day = shift({
      activity: [session("2026-10-13T08:00:00Z", "2026-10-13T16:40:00Z")], // to 17:40 WAT
    });
    // Old behaviour: a stale open shift is unmeasurable.
    expect(creditedWorkedMs({ ...day, activity: [] }, NEXT_MORNING)).toBeNull();
    // New: 08:00 → 16:40 UTC plus 15 minutes grace.
    expect(creditedWorkedMs(day, NEXT_MORNING)).toBe(8 * H + 55 * M);
    expect(lastActivityAt(day, NEXT_MORNING)).toBe("2026-10-13T16:40:00.000Z");
    expect(suggestedSignOutAt(day, NEXT_MORNING)).toBe("2026-10-13T16:55:00.000Z");
  });

  it("does not count the hours between a midnight sign-in and the real start", () => {
    // Production's 00:05 → 17:03 "17-hour day".
    const day = shift({
      work_date: "2026-09-09",
      signed_in_at: "2026-09-08T23:05:00Z", // 00:05 WAT
      signed_out_at: "2026-09-09T16:03:00Z", // 17:03 WAT
      activity: [
        session("2026-09-08T23:05:00Z", "2026-09-08T23:06:00Z"),
        session("2026-09-09T07:00:00Z", "2026-09-09T16:03:00Z"),
      ],
    });
    expect(workedMs(day)).toBe(16 * H + 58 * M);
    // 00:05–00:21 (1m + 15m grace) and 08:00–17:03 (clipped at sign-out).
    expect(creditedWorkedMs(day)).toBe(16 * M + 9 * H + 3 * M);
  });

  it("takes recorded breaks off only where they overlap counted time", () => {
    const day = shift({
      signed_out_at: "2026-10-13T16:00:00Z",
      activity: [
        session("2026-10-13T08:00:00Z", "2026-10-13T11:00:00Z"),
        session("2026-10-13T13:00:00Z", "2026-10-13T16:00:00Z"),
      ],
      breaks: [
        { id: "b1", started_at: "2026-10-13T11:00:00Z", ended_at: "2026-10-13T13:00:00Z" },
      ],
    });
    // Blocks: 08:00–11:15 and 13:00–16:00. Break overlaps 11:00–11:15 only.
    expect(creditedMs(day)).toBe(3 * H + 15 * M + 3 * H - 15 * M);
  });

  it("does not let the next morning's work extend a forgotten shift", () => {
    const day = shift({
      activity: [
        session("2026-10-13T08:00:00Z", "2026-10-13T16:00:00Z"),
        // Next WAT day, before signing in again.
        session("2026-10-14T07:50:00Z", "2026-10-14T08:00:00Z"),
      ],
    });
    expect(suggestedSignOutAt(day, NEXT_MORNING)).toBe("2026-10-13T16:15:00.000Z");
    expect(creditedMs(day, NEXT_MORNING)).toBe(8 * H + 15 * M);
  });

  it("still credits a stretch that started on the day and ran past midnight", () => {
    const day = shift({
      signed_in_at: "2026-10-13T20:00:00Z", // 21:00 WAT
      activity: [session("2026-10-13T20:00:00Z", "2026-10-13T23:30:00Z")], // 00:30 WAT
    });
    expect(creditedMs(day, NEXT_MORNING)).toBe(3 * H + 45 * M);
  });

  it("falls back to clock time without an activity record", () => {
    const closed = shift({ signed_out_at: "2026-10-13T16:00:00Z" });
    expect(creditedMs(closed)).toBeNull();
    expect(creditedWorkedMs(closed)).toBe(8 * H);
  });

  it("trusts a manager's correction over activity", () => {
    const day = shift({
      signed_out_at: "2026-10-13T17:00:00Z",
      adjusted_at: "2026-10-14T09:00:00Z",
      activity: [session("2026-10-13T08:00:00Z", "2026-10-13T09:00:00Z")],
    });
    expect(creditedWorkedMs(day)).toBe(9 * H);
  });
});

describe("decideForgottenSignOut", () => {
  const withActivity = shift({
    activity: [session("2026-10-13T08:00:00Z", "2026-10-13T16:40:00Z")],
  });

  it("closes at the suggested time as confirmed from activity", () => {
    const result = decideForgottenSignOut(withActivity, "2026-10-13T16:55:00Z", NEXT_MORNING);
    expect(result).toMatchObject({ ok: true, kind: "close", source: "activity_confirmed" });
  });

  it("closes at an earlier time as self-reported", () => {
    const result = decideForgottenSignOut(withActivity, "2026-10-13T15:00:00Z", NEXT_MORNING);
    expect(result).toMatchObject({ ok: true, kind: "close", source: "self_reported" });
  });

  it("turns a later time into a request for a manager", () => {
    const result = decideForgottenSignOut(withActivity, "2026-10-13T18:00:00Z", NEXT_MORNING);
    expect(result).toMatchObject({ ok: true, kind: "request" });
  });

  it("sends any time to a manager when there is no activity to check", () => {
    const result = decideForgottenSignOut(shift(), "2026-10-13T12:00:00Z", NEXT_MORNING);
    expect(result).toMatchObject({ ok: true, kind: "request" });
  });

  it("refuses today's running shift, closed shifts and pending requests", () => {
    const today = new Date("2026-10-13T12:00:00Z");
    expect(decideForgottenSignOut(shift(), "2026-10-13T11:00:00Z", today).ok).toBe(false);
    expect(
      decideForgottenSignOut(
        shift({ signed_out_at: "2026-10-13T16:00:00Z" }),
        "2026-10-13T15:00:00Z",
        NEXT_MORNING
      ).ok
    ).toBe(false);
    expect(
      decideForgottenSignOut(
        shift({ requested_sign_out_at: "2026-10-13T18:00:00Z" }),
        "2026-10-13T15:00:00Z",
        NEXT_MORNING
      ).ok
    ).toBe(false);
  });

  it("still applies the hand-entered time rules", () => {
    const result = decideForgottenSignOut(withActivity, "2026-10-13T07:00:00Z", NEXT_MORNING);
    expect(result.ok).toBe(false);
  });
});

describe("unresolvedShifts", () => {
  it("lists earlier open shifts without a pending request, newest first", () => {
    const list = unresolvedShifts(
      [
        shift({ id: "a", work_date: "2026-10-09" }),
        shift({ id: "b", work_date: "2026-10-12" }),
        shift({ id: "c", work_date: "2026-10-13", requested_sign_out_at: "x" }),
        shift({ id: "d", work_date: "2026-10-14" }), // today
        shift({ id: "e", work_date: "2026-10-08", signed_out_at: "2026-10-08T16:00:00Z" }),
      ],
      NEXT_MORNING
    );
    expect(list.map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("attachActivity", () => {
  it("trims sessions to each shift and bounds an open shift by the next sign-in", async () => {
    const mock = createSupabaseMock({
      attendance_activity_sessions: {
        data: [
          { account_manager_id: "am-1", ...session("2026-10-13T07:30:00Z", "2026-10-13T16:00:00Z") },
          { account_manager_id: "am-1", ...session("2026-10-14T06:30:00Z", "2026-10-14T07:30:00Z") },
          { account_manager_id: "am-2", ...session("2026-10-13T08:00:00Z", "2026-10-13T09:00:00Z") },
        ],
      },
    });
    const [first, second] = await attachActivity(
      mock.client as never,
      [
        shift(),
        shift({ id: "day-2", work_date: "2026-10-14", signed_in_at: "2026-10-14T07:00:00Z" }),
      ],
      new Date("2026-10-14T10:00:00Z")
    );
    // Starts at sign-in, not 07:30; tomorrow's session stops at the next sign-in.
    expect(first.activity).toEqual([
      session("2026-10-13T08:00:00.000Z", "2026-10-13T16:00:00.000Z"),
      session("2026-10-14T06:30:00.000Z", "2026-10-14T07:00:00.000Z"),
    ]);
    expect(second.activity).toEqual([
      session("2026-10-14T07:00:00.000Z", "2026-10-14T07:30:00.000Z"),
    ]);
    // And the pure layer still keeps tomorrow out of the forgotten shift.
    expect(suggestedSignOutAt(first, new Date("2026-10-14T10:00:00Z"))).toBe(
      "2026-10-13T16:15:00.000Z"
    );
  });

  it("falls back to no activity when the lookup fails", async () => {
    const mock = createSupabaseMock({
      attendance_activity_sessions: { error: { message: "boom" } },
    });
    const [day] = await attachActivity(mock.client as never, [shift()], NEXT_MORNING);
    expect(day.activity).toEqual([]);
  });
});

describe("recordActivity", () => {
  const NOW = new Date("2026-10-13T10:00:00Z");

  it("stretches the latest session after a short silence", async () => {
    const mock = createSupabaseMock({
      attendance_activity_sessions: {
        data: { id: "s1", last_seen_at: "2026-10-13T09:55:00Z" },
      },
    });
    await recordActivity(mock.client as never, "am-1", NOW);
    const update = mock.callsFor("attendance_activity_sessions", "update")[0];
    expect(update.payload).toEqual({ last_seen_at: NOW.toISOString() });
    expect(filteredOn(update, "eq", "id", "s1")).toBe(true);
  });

  it("starts a new session after more than ten minutes", async () => {
    const mock = createSupabaseMock({
      attendance_activity_sessions: {
        data: { id: "s1", last_seen_at: "2026-10-13T09:30:00Z" },
      },
    });
    await recordActivity(mock.client as never, "am-1", NOW);
    expect(mock.payloadFor("attendance_activity_sessions", "insert")).toEqual({
      account_manager_id: "am-1",
      started_at: NOW.toISOString(),
      last_seen_at: NOW.toISOString(),
    });
  });

  it("skips the write when the last heartbeat was under a minute ago", async () => {
    const mock = createSupabaseMock({
      attendance_activity_sessions: {
        data: { id: "s1", last_seen_at: "2026-10-13T09:59:30Z" },
      },
    });
    await recordActivity(mock.client as never, "am-1", NOW);
    expect(mock.callsFor("attendance_activity_sessions", "update")).toHaveLength(0);
    expect(mock.callsFor("attendance_activity_sessions", "insert")).toHaveLength(0);
  });
});

// ─── POST /api/am/attendance/resolve ─────────────────────────────────────

const auth = vi.hoisted(() => ({ current: null as unknown }));
const db = vi.hoisted(() => ({ current: null as unknown }));
const sent = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("@/lib/auth", () => ({
  requireAM: async () => auth.current,
  get supabaseAdmin() {
    return (db.current as { client: unknown }).client;
  },
}));

vi.mock("@/lib/notify", () => ({
  NOTIFICATION_CATEGORIES: { attendance_sign_out_request: "attendance_sign_out_request" },
  sendNotification: async (input: unknown) => {
    sent.list.push(input);
    return { id: "n1", channel: "both" };
  },
}));

import { POST as resolve } from "@/app/api/am/attendance/resolve/route";

function setupResolve(results: ResultMap = {}) {
  const mock = createSupabaseMock({
    attendance_days: {
      data: {
        id: "day-1",
        account_manager_id: "am-1",
        work_date: "2026-10-13",
        signed_in_at: "2026-10-13T08:00:00Z",
        signed_out_at: null,
        requested_sign_out_at: null,
      },
    },
    attendance_breaks: { data: [] },
    attendance_activity_sessions: {
      data: [{ account_manager_id: "am-1", ...session("2026-10-13T08:00:00Z", "2026-10-13T16:40:00Z") }],
    },
    account_managers: {
      data: [
        { id: "am-1", role: "am" },
        { id: "boss", role: "ops_manager" },
      ],
    },
    ...results,
  });
  db.current = mock;
  return mock;
}

function post(body: unknown) {
  return resolve(
    new Request("http://localhost/api/am/attendance/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

describe("resolve route", () => {
  beforeEach(() => {
    auth.current = authAs("am-1", "am");
    sent.list = [];
    vi.useFakeTimers();
    vi.setSystemTime(NEXT_MORNING);
  });

  it("closes the shift when the worker confirms their last activity", async () => {
    const mock = setupResolve();
    const res = await post({ day_id: "day-1", signed_out_at: "2026-10-13T16:55:00Z" });
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("closed");
    const update = mock.callsFor("attendance_days", "update")[0];
    expect(update.payload).toMatchObject({
      signed_out_at: "2026-10-13T16:55:00.000Z",
      close_source: "activity_confirmed",
    });
    expect(filteredOn(update, "is", "signed_out_at", null)).toBe(true);
    expect(sent.list).toHaveLength(0);
  });

  it("stores a later time as a request and tells the people managers", async () => {
    const mock = setupResolve();
    const res = await post({
      day_id: "day-1",
      signed_out_at: "2026-10-13T18:30:00Z",
      note: "client calls",
    });
    expect((await res.json()).outcome).toBe("requested");
    const update = mock.callsFor("attendance_days", "update")[0];
    expect(update.payload).toMatchObject({
      requested_sign_out_at: "2026-10-13T18:30:00.000Z",
      request_note: "client calls",
    });
    expect((update.payload as Record<string, unknown>).signed_out_at).toBeUndefined();
    expect(sent.list).toHaveLength(1);
    expect(sent.list[0]).toMatchObject({ userId: "boss" });
  });

  it("will not touch someone else's shift", async () => {
    auth.current = authAs("am-2", "am");
    const mock = setupResolve();
    const res = await post({ day_id: "day-1", signed_out_at: "2026-10-13T16:55:00Z" });
    expect(res.status).toBe(404);
    expect(mock.callsFor("attendance_days", "update")).toHaveLength(0);
  });
});
