import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: { trackId: string; lessonId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  // Verify track ownership
  const { data: track } = await supabaseServer
    .from("learning_tracks")
    .select("id")
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id)
    .single();

  if (!track) {
    return Response.json({ success: false, error: "Track not found." }, { status: 404 });
  }

  let body: {
    title?: string;
    content_type?: string;
    content?: Record<string, unknown>;
    sort_order?: number;
    estimated_minutes?: number;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (body.estimated_minutes !== undefined) updates.estimated_minutes = body.estimated_minutes;

  const validContentTypes = ["article", "video", "exercise", "quiz", "resource_link"];
  if (body.content_type && validContentTypes.includes(body.content_type)) {
    updates.content_type = body.content_type;
  }

  const { data: lesson, error } = await supabaseServer
    .from("learning_lessons")
    .update(updates)
    .eq("id", params.lessonId)
    .eq("track_id", params.trackId)
    .select("*")
    .single();

  if (error || !lesson) {
    return Response.json({ success: false, error: "Failed to update lesson." }, { status: 500 });
  }

  // Update track timestamp
  await supabaseServer
    .from("learning_tracks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.trackId);

  return Response.json({ success: true, lesson });
}

export async function DELETE(
  request: Request,
  { params }: { params: { trackId: string; lessonId: string } }
) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  // Verify track ownership
  const { data: track } = await supabaseServer
    .from("learning_tracks")
    .select("id")
    .eq("id", params.trackId)
    .eq("account_manager_id", amResult.accountManager.id)
    .single();

  if (!track) {
    return Response.json({ success: false, error: "Track not found." }, { status: 404 });
  }

  const { error } = await supabaseServer
    .from("learning_lessons")
    .delete()
    .eq("id", params.lessonId)
    .eq("track_id", params.trackId);

  if (error) {
    return Response.json({ success: false, error: "Failed to delete lesson." }, { status: 500 });
  }

  return Response.json({ success: true });
}
