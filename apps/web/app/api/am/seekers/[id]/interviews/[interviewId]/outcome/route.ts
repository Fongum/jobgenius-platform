import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { logActivity, recordFeedback } from "@/lib/feedback-loop";

interface RouteParams {
  params: { id: string; interviewId: string };
}

// PATCH /api/am/seekers/[id]/interviews/[interviewId]/outcome
// Record the outcome of an interview
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAM(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: seekerId, interviewId } = params;
  const amId = auth.user.id;

  if (!(await hasJobSeekerAccess(amId, seekerId))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    outcome,
    offer_amount,
    hire_date,
    rejection_reason,
    outcome_notes,
  } = body;

  const validOutcomes = ["pending", "offer_extended", "hired", "rejected", "ghosted", "declined"];
  if (!outcome || !validOutcomes.includes(outcome)) {
    return NextResponse.json(
      { error: `outcome must be one of: ${validOutcomes.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify interview belongs to this seeker
  const { data: interview } = await supabaseAdmin
    .from("interviews")
    .select("id, job_seeker_id")
    .eq("id", interviewId)
    .eq("job_seeker_id", seekerId)
    .single();

  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Update interview outcome
  const updatePayload: Record<string, unknown> = {
    outcome,
    outcome_notes: outcome_notes || null,
    outcome_recorded_at: new Date().toISOString(),
    outcome_recorded_by: amId,
  };

  if (outcome === "offer_extended" || outcome === "hired") {
    updatePayload.offer_amount = offer_amount || null;
  }
  if (outcome === "hired") {
    updatePayload.hire_date = hire_date || null;
    // Update interview status to COMPLETED
    updatePayload.status = "COMPLETED";
  }
  if (outcome === "rejected") {
    updatePayload.rejection_reason = rejection_reason || null;
  }

  const { data: updated, error } = await supabaseAdmin
    .from("interviews")
    .update(updatePayload)
    .eq("id", interviewId)
    .select("id, outcome, outcome_recorded_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update outcome" }, { status: 500 });
  }

  // If hired, update job_seeker placement fields
  if (outcome === "hired") {
    const { data: jobPost } = await supabaseAdmin
      .from("interviews")
      .select("job_posts(company_name, title)")
      .eq("id", interviewId)
      .single();

    const jp = (jobPost as unknown as { job_posts?: { company_name?: string; title?: string } })?.job_posts;

    await supabaseAdmin
      .from("job_seekers")
      .update({
        placed_at: new Date().toISOString(),
        placed_company: jp?.company_name || null,
        placed_role: jp?.title || null,
        placed_salary: offer_amount || null,
        status: "placed",
      })
      .eq("id", seekerId);

    // Mark any pending referral as placed (non-fatal)
    try {
      const { markReferralPlaced } = await import("@/lib/referrals");
      await markReferralPlaced(seekerId);
    } catch (err) {
      console.error("markReferralPlaced error (non-fatal):", err);
    }
  }

  // Log to activity feed (non-blocking)
  const outcomeLabels: Record<string, string> = {
    offer_extended: "Offer extended",
    hired: "Hired!",
    rejected: "Interview rejected",
    ghosted: "Ghosted after interview",
    declined: "Candidate declined",
  };

  logActivity(seekerId, {
    eventType: outcome === "hired" ? "seeker_placed" : "interview_outcome",
    title: outcomeLabels[outcome] ?? `Interview outcome: ${outcome}`,
    description: outcome_notes || undefined,
    meta: { interview_id: interviewId, outcome, offer_amount },
    refType: "interviews",
    refId: interviewId,
  }).catch((err) => console.error("[interview:outcome] activity log failed:", err));

  // Auto-record rejection feedback for learning
  if (outcome === "rejected" || outcome === "ghosted") {
    recordFeedback({
      jobSeekerId: seekerId,
      interviewId,
      feedbackType: outcome === "rejected" ? "interview_rejected" : "ghosted",
      rejectionReason: rejection_reason || undefined,
      rejectionCategory: rejection_reason ? undefined : "no_response",
      source: "am_recorded",
      createdBy: amId,
    }).catch((err) => console.error("[interview:outcome] feedback recording failed:", err));
  }

  return NextResponse.json({ interview: updated });
}
