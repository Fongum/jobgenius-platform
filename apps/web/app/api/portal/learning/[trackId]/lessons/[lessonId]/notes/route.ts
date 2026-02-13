import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: { trackId: string; lessonId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { data: notes, error } = await supabaseAdmin
    .from("learning_notes")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .eq("lesson_id", params.lessonId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Failed to fetch notes." }, { status: 500 });
  }

  return Response.json({ notes: notes ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: { trackId: string; lessonId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify track ownership
  const { data: track } = await supabaseAdmin
    .from("learning_tracks")
    .select("id")
    .eq("id", params.trackId)
    .eq("job_seeker_id", auth.user.id)
    .eq("status", "published")
    .single();

  if (!track) {
    return Response.json({ error: "Track not found." }, { status: 404 });
  }

  let body: { content?: string; note_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.content?.trim()) {
    return Response.json({ error: "Note content is required." }, { status: 400 });
  }

  // If note_id provided, update existing
  if (body.note_id) {
    const { data: note, error } = await supabaseAdmin
      .from("learning_notes")
      .update({
        content: body.content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.note_id)
      .eq("job_seeker_id", auth.user.id)
      .select("*")
      .single();

    if (error || !note) {
      return Response.json({ error: "Failed to update note." }, { status: 500 });
    }

    return Response.json({ note });
  }

  // Create new note
  const { data: note, error } = await supabaseAdmin
    .from("learning_notes")
    .insert({
      job_seeker_id: auth.user.id,
      lesson_id: params.lessonId,
      content: body.content.trim(),
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to create note." }, { status: 500 });
  }

  return Response.json({ note }, { status: 201 });
}
