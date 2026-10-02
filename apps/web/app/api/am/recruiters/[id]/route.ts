import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { logAdminAction } from "@/lib/audit";
import {
  DIRECTORY_OPT_OUT_SOURCE,
  getVisibleRecruiter,
  planRecruiterUpdate,
  type RecruiterUpdateBody,
} from "@/lib/recruiter-directory";

const UNIQUE_VIOLATION = "23505";

/**
 * PATCH /api/am/recruiters/[id]
 *
 * Body: { notes?, owner_account_manager_id?, do_not_contact?, do_not_contact_reason? }
 *
 * Visibility comes from the same SQL as the directory, so an AM cannot edit
 * a recruiter they could not list. The permission rules (who may reassign,
 * who may lift do-not-contact) live in planRecruiterUpdate.
 */
export async function PATCH(request: Request, context: { params: { id: string } }) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const viewer = { id: auth.user.id, isAdmin: isAdminRole(auth.user.role) };
  const recruiterId = context.params.id;

  let body: RecruiterUpdateBody;
  try {
    body = (await request.json()) as RecruiterUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const recruiter = await getVisibleRecruiter(viewer, recruiterId);
  if (!recruiter) {
    return NextResponse.json({ error: "Recruiter not found." }, { status: 404 });
  }

  const { data: optOutRow } = await supabaseAdmin
    .from("recruiter_opt_outs")
    .select("source")
    .eq("recruiter_id", recruiterId)
    .maybeSingle();

  const plan = planRecruiterUpdate({
    viewer,
    current: {
      owner_account_manager_id: recruiter.owner_account_manager_id,
      do_not_contact: recruiter.do_not_contact,
    },
    optOutSource: optOutRow ? ((optOutRow.source as string | null) ?? "unknown") : null,
    body,
  });

  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: plan.status });
  }

  if (typeof plan.update.owner_account_manager_id === "string") {
    const { data: owner } = await supabaseAdmin
      .from("account_managers")
      .select("id")
      .eq("id", plan.update.owner_account_manager_id)
      .maybeSingle();
    if (!owner) {
      return NextResponse.json({ error: "Account manager not found." }, { status: 400 });
    }
  }

  // Ordering is chosen so a half-applied change always errs toward NOT
  // emailing: when setting DNC the opt-out is written before the flag, and
  // when lifting it the flag is cleared before the opt-out is removed.
  if (plan.optOut?.action === "insert") {
    const { error } = await supabaseAdmin.from("recruiter_opt_outs").insert({
      recruiter_id: recruiterId,
      email: recruiter.email,
      reason: plan.optOut.reason,
      source: DIRECTORY_OPT_OUT_SOURCE,
    });
    // Someone (or the recruiter's own unsubscribe) got there first: the
    // recruiter is opted out either way, and that opt-out is kept.
    if (error && error.code !== UNIQUE_VIOLATION) {
      return NextResponse.json({ error: "Could not record the opt-out." }, { status: 500 });
    }
  }

  if (Object.keys(plan.update).length > 0) {
    const { error } = await supabaseAdmin
      .from("recruiters")
      .update({ ...plan.update, updated_at: new Date().toISOString() })
      .eq("id", recruiterId);
    if (error) {
      return NextResponse.json({ error: "Could not update the recruiter." }, { status: 500 });
    }
  }

  if (plan.optOut?.action === "delete") {
    // Only ever this screen's own opt-out; the plan refuses any other source.
    const { error } = await supabaseAdmin
      .from("recruiter_opt_outs")
      .delete()
      .eq("recruiter_id", recruiterId)
      .eq("source", DIRECTORY_OPT_OUT_SOURCE);
    if (error) {
      return NextResponse.json({ error: "Could not lift the opt-out." }, { status: 500 });
    }
  }

  if (plan.audit) {
    await logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      adminRole: auth.user.role,
      action: "recruiter.update",
      targetType: "recruiter",
      targetId: recruiterId,
      details: plan.audit,
    });
  }

  const updated = await getVisibleRecruiter(viewer, recruiterId);
  return NextResponse.json({ recruiter: updated });
}
