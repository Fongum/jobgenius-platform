// ============================================================
// The unified recruiter directory: one row per recruiter across outreach
// threads and partner role requests.
//
// Visibility is decided in SQL by public.recruiter_directory (migration 124)
// so the list, the detail page and the update route cannot disagree:
//   admin -> everyone; AM -> owned, assigned a role request, or has a thread
//   with one of their seekers. Other AMs' threads are counted, never listed.
//
// Do-not-contact has two halves that used to be disconnected: the
// recruiters.do_not_contact flag (partner program) and recruiter_opt_outs
// (what every outreach send path actually checks). Setting DNC here writes
// both, so the flag cannot say "do not contact" while outreach keeps sending.
// ============================================================

import { supabaseAdmin } from "@/lib/auth";

export const RECRUITER_FILTERS = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "active", label: "Active outreach" },
  { key: "partners", label: "Hiring partners" },
  { key: "unowned", label: "No owner" },
  { key: "do_not_contact", label: "Do not contact" },
] as const;

export type RecruiterFilter = (typeof RECRUITER_FILTERS)[number]["key"];

export function parseRecruiterFilter(value: string | null | undefined): RecruiterFilter {
  return RECRUITER_FILTERS.some((filter) => filter.key === value)
    ? (value as RecruiterFilter)
    : "all";
}

export const RECRUITER_PAGE_SIZE = 50;

export type RecruiterDirectoryRow = {
  id: string;
  name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  linkedin_url: string | null;
  partner_type: string | null;
  source: string | null;
  status: string | null;
  notes: string | null;
  do_not_contact: boolean;
  opted_out: boolean;
  owner_account_manager_id: string | null;
  owner_name: string | null;
  own_thread_count: number;
  visible_thread_count: number;
  hidden_thread_count: number;
  best_stage: string | null;
  open_request_count: number;
  total_request_count: number;
  last_contacted_at: string | null;
  last_activity_at: string | null;
  created_at: string | null;
  total_count: number;
};

export type DirectoryViewer = { id: string; isAdmin: boolean };

export async function loadRecruiterDirectory(
  viewer: DirectoryViewer,
  options: { search?: string | null; filter?: RecruiterFilter; page?: number }
): Promise<{ rows: RecruiterDirectoryRow[]; total: number; error: string | null }> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const { data, error } = await supabaseAdmin.rpc("recruiter_directory", {
    p_account_manager_id: viewer.id,
    p_is_admin: viewer.isAdmin,
    p_search: options.search?.trim() || null,
    p_filter: options.filter ?? "all",
    p_recruiter_id: null,
    p_limit: RECRUITER_PAGE_SIZE,
    p_offset: (page - 1) * RECRUITER_PAGE_SIZE,
  });

  if (error) return { rows: [], total: 0, error: error.message };

  const rows = (data ?? []) as RecruiterDirectoryRow[];
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0, error: null };
}

/** The directory row for one recruiter, or null when the viewer may not see it. */
export async function getVisibleRecruiter(
  viewer: DirectoryViewer,
  recruiterId: string
): Promise<RecruiterDirectoryRow | null> {
  const { data, error } = await supabaseAdmin.rpc("recruiter_directory", {
    p_account_manager_id: viewer.id,
    p_is_admin: viewer.isAdmin,
    p_search: null,
    p_filter: "all",
    p_recruiter_id: recruiterId,
    p_limit: 1,
    p_offset: 0,
  });

  if (error || !data) return null;
  const rows = data as RecruiterDirectoryRow[];
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

/**
 * Opt-outs this screen may lift: only ones it created. An opt-out from the
 * recruiter's own unsubscribe, a bounce, or an AM recording "they asked us to
 * stop" on a thread is the recipient's decision and is not reversible here.
 */
export const DIRECTORY_OPT_OUT_SOURCE = "recruiter_directory";
const LIFTABLE_OPT_OUT_SOURCES = new Set([DIRECTORY_OPT_OUT_SOURCE]);

export const NOTES_MAX = 4000;
export const DNC_REASON_MAX = 500;

export type RecruiterUpdateBody = {
  notes?: unknown;
  do_not_contact?: unknown;
  do_not_contact_reason?: unknown;
  owner_account_manager_id?: unknown;
};

export type RecruiterUpdatePlan =
  | {
      ok: true;
      update: Record<string, unknown>;
      optOut: { action: "insert"; reason: string } | { action: "delete" } | null;
      audit: Record<string, unknown> | null;
    }
  | { ok: false; status: number; error: string };

/**
 * Validates a PATCH and decides exactly what to write. Pure, so the
 * permission rules are tested without a database.
 */
export function planRecruiterUpdate(input: {
  viewer: DirectoryViewer;
  current: { owner_account_manager_id: string | null; do_not_contact: boolean };
  optOutSource: string | null;
  body: RecruiterUpdateBody;
}): RecruiterUpdatePlan {
  const { viewer, current, optOutSource, body } = input;
  const update: Record<string, unknown> = {};
  const audit: Record<string, unknown> = {};
  let optOut: { action: "insert"; reason: string } | { action: "delete" } | null = null;

  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return { ok: false, status: 400, error: "notes must be a string." };
    }
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (notes.length > NOTES_MAX) {
      return { ok: false, status: 400, error: `Notes are limited to ${NOTES_MAX} characters.` };
    }
    update.notes = notes || null;
  }

  if (body.owner_account_manager_id !== undefined) {
    const next = body.owner_account_manager_id;
    if (next !== null && typeof next !== "string") {
      return { ok: false, status: 400, error: "owner_account_manager_id must be a string or null." };
    }
    if (next !== current.owner_account_manager_id) {
      if (!viewer.isAdmin) {
        // An AM may claim an unowned recruiter, or release one they own.
        const claiming = next === viewer.id && current.owner_account_manager_id === null;
        const releasing = next === null && current.owner_account_manager_id === viewer.id;
        if (!claiming && !releasing) {
          return {
            ok: false,
            status: 403,
            error: "Only an admin can reassign a recruiter that someone else owns.",
          };
        }
      }
      update.owner_account_manager_id = next;
      audit.owner = { from: current.owner_account_manager_id, to: next };
    }
  }

  if (body.do_not_contact !== undefined) {
    if (typeof body.do_not_contact !== "boolean") {
      return { ok: false, status: 400, error: "do_not_contact must be true or false." };
    }

    if (body.do_not_contact) {
      const reason =
        typeof body.do_not_contact_reason === "string" ? body.do_not_contact_reason.trim() : "";
      if (!reason) {
        return { ok: false, status: 400, error: "Give a reason for marking do-not-contact." };
      }
      if (reason.length > DNC_REASON_MAX) {
        return { ok: false, status: 400, error: `Reason is limited to ${DNC_REASON_MAX} characters.` };
      }
      update.do_not_contact = true;
      // Never overwrite an existing opt-out: it may be the recruiter's own.
      if (optOutSource === null) optOut = { action: "insert", reason };
      audit.do_not_contact = { to: true, reason };
    } else if (current.do_not_contact || optOutSource !== null) {
      if (!viewer.isAdmin) {
        return { ok: false, status: 403, error: "Only an admin can lift do-not-contact." };
      }
      if (optOutSource !== null && !LIFTABLE_OPT_OUT_SOURCES.has(optOutSource)) {
        return {
          ok: false,
          status: 409,
          error:
            "This recruiter's opt-out came from outside this screen (an unsubscribe, a bounce or a request recorded on a thread) and can't be lifted here.",
        };
      }
      update.do_not_contact = false;
      if (optOutSource !== null) optOut = { action: "delete" };
      audit.do_not_contact = { to: false };
    }
  }

  if (Object.keys(update).length === 0 && optOut === null) {
    return { ok: false, status: 400, error: "Nothing to update." };
  }

  return {
    ok: true,
    update,
    optOut,
    audit: Object.keys(audit).length > 0 ? audit : null,
  };
}
