import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { trackId: string } }
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

  if (!body.title) {
    return Response.json(
      { success: false, error: "Missing required field: title." },
      { status: 400 }
    );
  }

  const validContentTypes = ["article", "video", "exercise", "quiz", "resource_link"];
  const contentType = validContentTypes.includes(body.content_type ?? "")
    ? body.content_type
    : "article";

  // Get next sort order if not provided
  let sortOrder = body.sort_order;
  if (sortOrder === undefined) {
    const { data: lastLesson } = await supabaseServer
      .from("learning_lessons")
      .select("sort_order")
      .eq("track_id", params.trackId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    sortOrder = (lastLesson?.sort_order ?? -1) + 1;
  }

  const { data: lesson, error } = await supabaseServer
    .from("learning_lessons")
    .insert({
      track_id: params.trackId,
      title: body.title,
      content_type: contentType,
      content: body.content ?? {},
      sort_order: sortOrder,
      estimated_minutes: body.estimated_minutes ?? 10,
      is_ai_generated: false,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ success: false, error: "Failed to create lesson." }, { status: 500 });
  }

  // Update track timestamp
  await supabaseServer
    .from("learning_tracks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.trackId);

  return Response.json({ success: true, lesson }, { status: 201 });
}
