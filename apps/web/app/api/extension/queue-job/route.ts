import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";

/**
 * POST /api/extension/queue-job
 *
 * Queue a matched job for application from the extension.
 * Body: { job_post_id, job_seeker_id? }
 *
 * If job_seeker_id is omitted, uses the active seeker from the session.
 */
export async function POST(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { job_post_id } = body;
    const job_seeker_id = body.job_seeker_id || session.active_job_seeker_id;

    if (!job_post_id) {
      return NextResponse.json(
        { error: "job_post_id is required." },
        { status: 400 }
      );
    }

    if (!job_seeker_id) {
      return NextResponse.json(
        { error: "No job seeker specified or active." },
        { status: 400 }
      );
    }

    // Verify AM has access to this job seeker
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", session.account_manager_id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Not authorized for this job seeker." },
        { status: 403 }
      );
    }

    // Check if already queued
    const { data: existingQueue } = await supabaseAdmin
      .from("application_queue")
      .select("id, status")
      .eq("job_post_id", job_post_id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();

    if (existingQueue) {
      return NextResponse.json({
        success: true,
        already_queued: true,
        status: existingQueue.status,
      });
    }

    // Also check application_runs
    const { data: existingRun } = await supabaseAdmin
      .from("application_runs")
      .select("id, status")
      .eq("job_post_id", job_post_id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();

    if (existingRun) {
      return NextResponse.json({
        success: true,
        already_applied: true,
        status: existingRun.status,
      });
    }

    // Insert into application_queue
    const { error: insertError } = await supabaseAdmin
      .from("application_queue")
      .insert({
        job_post_id,
        job_seeker_id,
        status: "QUEUED",
        category: "matched",
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Error queueing job:", insertError);
      return NextResponse.json(
        { error: "Failed to queue application." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Extension queue-job error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
