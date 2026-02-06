import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

/**
 * POST /api/admin/assignments
 * Create or update an assignment (assigns a job seeker to an account manager)
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { job_seeker_id, account_manager_id } = body;

    if (!job_seeker_id || !account_manager_id) {
      return NextResponse.json(
        { error: "job_seeker_id and account_manager_id are required." },
        { status: 400 }
      );
    }

    // Verify job seeker exists
    const { data: seeker } = await supabaseAdmin
      .from("job_seekers")
      .select("id")
      .eq("id", job_seeker_id)
      .single();

    if (!seeker) {
      return NextResponse.json(
        { error: "Job seeker not found." },
        { status: 404 }
      );
    }

    // Verify account manager exists
    const { data: am } = await supabaseAdmin
      .from("account_managers")
      .select("id")
      .eq("id", account_manager_id)
      .single();

    if (!am) {
      return NextResponse.json(
        { error: "Account manager not found." },
        { status: 404 }
      );
    }

    // Check if already assigned to this AM
    const { data: existingToSameAm } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("job_seeker_id", job_seeker_id)
      .eq("account_manager_id", account_manager_id)
      .maybeSingle();

    if (existingToSameAm) {
      return NextResponse.json(
        { message: "Already assigned to this account manager." },
        { status: 200 }
      );
    }

    // Delete any existing assignment (reassignment scenario)
    await supabaseAdmin
      .from("job_seeker_assignments")
      .delete()
      .eq("job_seeker_id", job_seeker_id);

    // Create new assignment
    const { data: assignment, error } = await supabaseAdmin
      .from("job_seeker_assignments")
      .insert({
        job_seeker_id,
        account_manager_id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(assignment);
  } catch (error) {
    console.error("Error creating assignment:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/assignments?job_seeker_id=xxx
 * Remove an assignment
 */
export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const job_seeker_id = url.searchParams.get("job_seeker_id");

    if (!job_seeker_id) {
      return NextResponse.json(
        { error: "job_seeker_id is required." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("job_seeker_assignments")
      .delete()
      .eq("job_seeker_id", job_seeker_id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting assignment:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/assignments
 * List all assignments
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { data: assignments, error } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select(`
        id,
        created_at,
        job_seeker_id,
        account_manager_id,
        job_seekers (id, full_name, email, location, seniority),
        account_managers (id, name, email)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(assignments || []);
  } catch (error) {
    console.error("Error listing assignments:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
