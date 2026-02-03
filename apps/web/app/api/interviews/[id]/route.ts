import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
  }

  const { data: interview, error } = await supabaseServer
    .from("interviews")
    .select(
      "*, job_posts (title, company, url), job_seekers (full_name, email), interview_slot_offers (id, slot_id, is_selected, interview_slots (start_at, end_at, duration_min))"
    )
    .eq("id", params.id)
    .single();

  if (error || !interview) {
    return Response.json({ success: false, error: "Interview not found." }, { status: 404 });
  }

  return Response.json({ success: true, interview });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireOpsAuth(request.headers, request.url);
  let amId: string | null = null;

  if (!auth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
    amId = amResult.accountManager.id;
  }

  let body: {
    status?: string;
    scheduled_at?: string;
    meeting_link?: string;
    phone_number?: string;
    address?: string;
    notes_for_candidate?: string;
    notes_internal?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status) {
    updates.status = body.status;
    if (body.status === "completed") updates.status = "completed";
    if (body.status === "no_show") updates.status = "no_show";
  }
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;
  if (body.meeting_link !== undefined) updates.meeting_link = body.meeting_link;
  if (body.phone_number !== undefined) updates.phone_number = body.phone_number;
  if (body.address !== undefined) updates.address = body.address;
  if (body.notes_for_candidate !== undefined) updates.notes_for_candidate = body.notes_for_candidate;
  if (body.notes_internal !== undefined) updates.notes_internal = body.notes_internal;

  let query = supabaseServer
    .from("interviews")
    .update(updates)
    .eq("id", params.id);

  if (amId) query = query.eq("account_manager_id", amId);

  const { data: interview, error } = await query.select("*").single();

  if (error || !interview) {
    return Response.json(
      { success: false, error: error?.message ?? "Interview not found." },
      { status: error ? 500 : 404 }
    );
  }

  return Response.json({ success: true, interview });
}
