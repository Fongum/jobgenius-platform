import { getAccountManagerFromRequest } from "@/lib/am-access";
import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: Request) {
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
    account_manager_id?: string;
    job_post_id?: string;
    start_at?: string;
    end_at?: string;
    duration_min?: number;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const managerId = amId ?? body.account_manager_id;
  if (!managerId || !body.start_at || !body.end_at) {
    return Response.json(
      { success: false, error: "Missing required fields: account_manager_id, start_at, end_at." },
      { status: 400 }
    );
  }

  const duration = body.duration_min ?? 30;
  if (![30, 45, 60].includes(duration)) {
    return Response.json(
      { success: false, error: "duration_min must be 30, 45, or 60." },
      { status: 400 }
    );
  }

  const { data: slot, error } = await supabaseServer
    .from("interview_slots")
    .insert({
      account_manager_id: managerId,
      job_post_id: body.job_post_id ?? null,
      start_at: body.start_at,
      end_at: body.end_at,
      duration_min: duration,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, slot });
}

export async function GET(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const accountManagerId = url.searchParams.get("account_manager_id");
  const jobPostId = url.searchParams.get("job_post_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = supabaseServer
    .from("interview_slots")
    .select("*")
    .eq("is_booked", false)
    .order("start_at", { ascending: true });

  if (accountManagerId) query = query.eq("account_manager_id", accountManagerId);
  if (jobPostId) query = query.eq("job_post_id", jobPostId);
  if (from) query = query.gte("start_at", from);
  if (to) query = query.lte("start_at", to);

  const { data: slots, error } = await query;

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, slots: slots ?? [] });
}

export async function DELETE(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  let amId: string | null = null;

  if (!auth.ok) {
    const amResult = await getAccountManagerFromRequest(request.headers);
    if ("error" in amResult) {
      return Response.json({ success: false, error: amResult.error }, { status: 401 });
    }
    amId = amResult.accountManager.id;
  }

  const url = new URL(request.url);
  const slotId = url.searchParams.get("id");
  if (!slotId) {
    return Response.json({ success: false, error: "Missing id parameter." }, { status: 400 });
  }

  // Only delete unbooked slots
  let query = supabaseServer
    .from("interview_slots")
    .delete()
    .eq("id", slotId)
    .eq("is_booked", false);

  if (amId) {
    query = query.eq("account_manager_id", amId);
  }

  const { error } = await query;

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
