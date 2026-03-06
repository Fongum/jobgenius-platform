import { NextRequest, NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";

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

  const body = await req.json();
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
  }

  return NextResponse.json({ interview: updated });
}
