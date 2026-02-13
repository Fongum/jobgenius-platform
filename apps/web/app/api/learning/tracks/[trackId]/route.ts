import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { data: track, error } = await supabaseServer
    .from("learning_tracks")
    .select(`
      *,
      job_seekers ( id, full_name, email ),
      job_posts ( id, title, company ),
      learning_lessons ( * )
    `)
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id)
    .single();

  if (error || !track) {
    return Response.json({ success: false, error: "Track not found." }, { status: 404 });
  }

  return Response.json({ success: true, track });
}

export async function PATCH(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    category?: string;
    status?: string;
    sort_order?: number;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const validCategories = ["technical", "behavioral", "industry", "tools", "general"];
  if (body.category && validCategories.includes(body.category)) {
    updates.category = body.category;
  }

  const validStatuses = ["draft", "published", "archived"];
  if (body.status && validStatuses.includes(body.status)) {
    updates.status = body.status;
  }

  const { data: track, error } = await supabaseServer
    .from("learning_tracks")
    .update(updates)
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id)
    .select("*")
    .single();

  if (error || !track) {
    return Response.json({ success: false, error: "Failed to update track." }, { status: 500 });
  }

  return Response.json({ success: true, track });
}

export async function DELETE(
  request: Request,
  { params }: { params: { trackId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { error } = await supabaseServer
    .from("learning_tracks")
    .delete()
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id);

  if (error) {
    return Response.json({ success: false, error: "Failed to delete track." }, { status: 500 });
  }

  return Response.json({ success: true });
}
