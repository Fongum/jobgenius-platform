// ============================================================
// Recruiter directory: who may change what, and do-not-contact that
// actually stops outreach.
//
// Visibility itself is SQL (public.recruiter_directory, migration 124) and
// was verified against Postgres 15; here getVisibleRecruiter is stubbed and
// the tests cover the TypeScript rules on top of it.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { authAs, createSupabaseMock, filteredOn, type SupabaseMock } from "./helpers/supabase-mock";

const auth = vi.hoisted(() => ({ current: null as unknown }));
const db = vi.hoisted(() => ({ current: null as unknown }));
const visible = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));
const audits = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock("@/lib/auth", () => ({
  requireAM: async () => auth.current,
  get supabaseAdmin() {
    return (db.current as SupabaseMock).client;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  get supabaseServer() {
    return (db.current as SupabaseMock).client;
  },
}));

vi.mock("@/lib/audit", () => ({
  logAdminAction: async (params: unknown) => {
    audits.list.push(params);
  },
}));

vi.mock("@/lib/recruiter-directory", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getVisibleRecruiter: async () => visible.row };
});

import { planRecruiterUpdate } from "@/lib/recruiter-directory";
import { PATCH } from "@/app/api/am/recruiters/[id]/route";
import { getRecruiterOptOut } from "@/lib/outreach-consent";

const AM = { id: "am-1", isAdmin: false };
const ADMIN = { id: "admin-1", isAdmin: true };
const UNOWNED = { owner_account_manager_id: null, do_not_contact: false };

function recruiterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    email: "jane@acme.com",
    owner_account_manager_id: null,
    do_not_contact: false,
    opted_out: false,
    ...overrides,
  };
}

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/am/recruiters/rec-1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: { id: "rec-1" } }
  );
}

beforeEach(() => {
  auth.current = authAs("am-1", "am");
  visible.row = recruiterRow();
  audits.list = [];
});

describe("planRecruiterUpdate — ownership", () => {
  it("lets an AM claim an unowned recruiter", () => {
    const plan = planRecruiterUpdate({
      viewer: AM,
      current: UNOWNED,
      optOutSource: null,
      body: { owner_account_manager_id: "am-1" },
    });
    expect(plan).toMatchObject({ ok: true, update: { owner_account_manager_id: "am-1" } });
  });

  it("lets an AM release a recruiter they own", () => {
    const plan = planRecruiterUpdate({
      viewer: AM,
      current: { owner_account_manager_id: "am-1", do_not_contact: false },
      optOutSource: null,
      body: { owner_account_manager_id: null },
    });
    expect(plan).toMatchObject({ ok: true, update: { owner_account_manager_id: null } });
  });

  it("stops an AM taking a recruiter someone else owns", () => {
    const plan = planRecruiterUpdate({
      viewer: AM,
      current: { owner_account_manager_id: "am-2", do_not_contact: false },
      optOutSource: null,
      body: { owner_account_manager_id: "am-1" },
    });
    expect(plan).toMatchObject({ ok: false, status: 403 });
  });

  it("stops an AM handing an unowned recruiter to someone else", () => {
    const plan = planRecruiterUpdate({
      viewer: AM,
      current: UNOWNED,
      optOutSource: null,
      body: { owner_account_manager_id: "am-2" },
    });
    expect(plan).toMatchObject({ ok: false, status: 403 });
  });

  it("lets an admin reassign freely, and audits it", () => {
    const plan = planRecruiterUpdate({
      viewer: ADMIN,
      current: { owner_account_manager_id: "am-2", do_not_contact: false },
      optOutSource: null,
      body: { owner_account_manager_id: "am-3" },
    });
    expect(plan).toMatchObject({ ok: true, audit: { owner: { from: "am-2", to: "am-3" } } });
  });
});

describe("planRecruiterUpdate — do not contact", () => {
  it("requires a reason", () => {
    const plan = planRecruiterUpdate({
      viewer: AM,
      current: UNOWNED,
      optOutSource: null,
      body: { do_not_contact: true, do_not_contact_reason: "  " },
    });
    expect(plan).toMatchObject({ ok: false, status: 400 });
  });

  it("any AM can set it, and it writes an opt-out so outreach stops", () => {
    const plan = planRecruiterUpdate({
      viewer: AM,
      current: UNOWNED,
      optOutSource: null,
      body: { do_not_contact: true, do_not_contact_reason: "Asked us to stop" },
    });
    expect(plan).toMatchObject({
      ok: true,
      update: { do_not_contact: true },
      optOut: { action: "insert", reason: "Asked us to stop" },
    });
  });

  it("never overwrites an existing opt-out (it may be the recruiter's own)", () => {
    const plan = planRecruiterUpdate({
      viewer: AM,
      current: UNOWNED,
      optOutSource: "resend_webhook",
      body: { do_not_contact: true, do_not_contact_reason: "Also flagging" },
    });
    expect(plan).toMatchObject({ ok: true, optOut: null });
  });

  it("only an admin can lift it", () => {
    const plan = planRecruiterUpdate({
      viewer: AM,
      current: { owner_account_manager_id: null, do_not_contact: true },
      optOutSource: "recruiter_directory",
      body: { do_not_contact: false },
    });
    expect(plan).toMatchObject({ ok: false, status: 403 });
  });

  it.each(["resend_webhook", "webhook", "am_manual", "unknown"])(
    "an admin cannot lift an opt-out from %s",
    (source) => {
      const plan = planRecruiterUpdate({
        viewer: ADMIN,
        current: { owner_account_manager_id: null, do_not_contact: true },
        optOutSource: source,
        body: { do_not_contact: false },
      });
      expect(plan).toMatchObject({ ok: false, status: 409 });
    }
  );

  it("an admin can lift this screen's own opt-out", () => {
    const plan = planRecruiterUpdate({
      viewer: ADMIN,
      current: { owner_account_manager_id: null, do_not_contact: true },
      optOutSource: "recruiter_directory",
      body: { do_not_contact: false },
    });
    expect(plan).toMatchObject({ ok: true, update: { do_not_contact: false }, optOut: { action: "delete" } });
  });
});

describe("planRecruiterUpdate — notes", () => {
  it("trims and stores blank as null", () => {
    expect(
      planRecruiterUpdate({ viewer: AM, current: UNOWNED, optOutSource: null, body: { notes: "   " } })
    ).toMatchObject({ ok: true, update: { notes: null } });
  });

  it("caps length", () => {
    expect(
      planRecruiterUpdate({
        viewer: AM,
        current: UNOWNED,
        optOutSource: null,
        body: { notes: "x".repeat(4001) },
      })
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects an empty update", () => {
    expect(planRecruiterUpdate({ viewer: AM, current: UNOWNED, optOutSource: null, body: {} })).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("PATCH /api/am/recruiters/[id]", () => {
  it("404s a recruiter the caller cannot see, without writing", async () => {
    visible.row = null;
    const mock = (db.current = createSupabaseMock()) as SupabaseMock;

    const res = await patch({ notes: "hi" });

    expect(res.status).toBe(404);
    expect(mock.calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("setting DNC writes the opt-out before the flag", async () => {
    const mock = (db.current = createSupabaseMock()) as SupabaseMock;

    const res = await patch({ do_not_contact: true, do_not_contact_reason: "Wrong person" });

    expect(res.status).toBe(200);
    const writes = mock.calls.filter((c) => c.op !== "select").map((c) => `${c.table}:${c.op}`);
    expect(writes).toEqual(["recruiter_opt_outs:insert", "recruiters:update"]);
    expect(mock.payloadFor("recruiter_opt_outs", "insert")).toMatchObject({
      recruiter_id: "rec-1",
      source: "recruiter_directory",
      reason: "Wrong person",
    });
    expect(audits.list).toHaveLength(1);
  });

  it("treats losing the opt-out insert race as success", async () => {
    db.current = createSupabaseMock({
      "recruiter_opt_outs:insert": { data: null, error: { code: "23505", message: "duplicate" } },
    });
    const res = await patch({ do_not_contact: true, do_not_contact_reason: "Wrong person" });
    expect(res.status).toBe(200);
  });

  it("does not flag the recruiter if the opt-out could not be written", async () => {
    const mock = (db.current = createSupabaseMock({
      "recruiter_opt_outs:insert": { data: null, error: { code: "42501", message: "denied" } },
    })) as SupabaseMock;

    const res = await patch({ do_not_contact: true, do_not_contact_reason: "Wrong person" });

    expect(res.status).toBe(500);
    expect(mock.callsFor("recruiters", "update")).toHaveLength(0);
  });

  it("lifting DNC clears the flag before removing only this screen's opt-out", async () => {
    auth.current = authAs("admin-1", "admin");
    visible.row = recruiterRow({ do_not_contact: true, opted_out: true });
    const mock = (db.current = createSupabaseMock({
      "recruiter_opt_outs:select": { data: { source: "recruiter_directory" } },
    })) as SupabaseMock;

    const res = await patch({ do_not_contact: false });

    expect(res.status).toBe(200);
    const writes = mock.calls.filter((c) => c.op !== "select").map((c) => `${c.table}:${c.op}`);
    expect(writes).toEqual(["recruiters:update", "recruiter_opt_outs:delete"]);
    const [del] = mock.callsFor("recruiter_opt_outs", "delete");
    expect(filteredOn(del, "eq", "source", "recruiter_directory")).toBe(true);
  });

  it("refuses to lift a recruiter's own unsubscribe, even for an admin", async () => {
    auth.current = authAs("admin-1", "admin");
    visible.row = recruiterRow({ do_not_contact: true, opted_out: true });
    const mock = (db.current = createSupabaseMock({
      "recruiter_opt_outs:select": { data: { source: "resend_webhook" } },
    })) as SupabaseMock;

    const res = await patch({ do_not_contact: false });

    expect(res.status).toBe(409);
    expect(mock.calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("rejects an owner who isn't an account manager", async () => {
    auth.current = authAs("admin-1", "admin");
    const mock = (db.current = createSupabaseMock({
      "account_managers:select": { data: null },
    })) as SupabaseMock;

    const res = await patch({ owner_account_manager_id: "ghost" });

    expect(res.status).toBe(400);
    expect(mock.callsFor("recruiters", "update")).toHaveLength(0);
  });
});

describe("getRecruiterOptOut", () => {
  it("blocks outreach when only the do_not_contact flag is set", async () => {
    db.current = createSupabaseMock({
      "recruiter_opt_outs:select": { data: null },
      "recruiters:select": { data: { do_not_contact: true } },
    });
    expect((await getRecruiterOptOut("rec-1")).optedOut).toBe(true);
  });

  it("allows outreach when neither is set", async () => {
    db.current = createSupabaseMock({
      "recruiter_opt_outs:select": { data: null },
      "recruiters:select": { data: { do_not_contact: false } },
    });
    expect((await getRecruiterOptOut("rec-1")).optedOut).toBe(false);
  });
});
