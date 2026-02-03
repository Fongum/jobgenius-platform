import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(
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

  let body: { cancelled_by?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const nowIso = new Date().toISOString();

  let query = supabaseServer
    .from("interviews")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancelled_by: body.cancelled_by ?? "recruiter",
      updated_at: nowIso,
    })
    .eq("id", params.id)
    .in("status", ["pending_candidate", "confirmed"]);

  if (amId) query = query.eq("account_manager_id", amId);

  const { data: interview, error } = await query.select("*").single();

  if (error || !interview) {
    return Response.json(
      { success: false, error: "Interview not found or already cancelled/completed." },
      { status: 404 }
    );
  }

  // Free up any booked slots
  const { data: offers } = await supabaseServer
    .from("interview_slot_offers")
    .select("slot_id, is_selected")
    .eq("interview_id", params.id);

  if (offers) {
    const selectedSlots = offers.filter((o) => o.is_selected).map((o) => o.slot_id);
    if (selectedSlots.length > 0) {
      await supabaseServer
        .from("interview_slots")
        .update({ is_booked: false, updated_at: nowIso })
        .in("id", selectedSlots);
    }
  }

  return Response.json({ success: true, interview });
}
