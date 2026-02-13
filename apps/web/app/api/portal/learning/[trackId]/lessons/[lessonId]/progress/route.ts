import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: { trackId: string; lessonId: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Verify lesson belongs to seeker's published track
  const { data: lesson } = await supabaseAdmin
    .from("learning_lessons")
    .select("id, track_id")
    .eq("id", params.lessonId)
    .eq("track_id", params.trackId)
    .single();

  if (!lesson) {
    return Response.json({ error: "Lesson not found." }, { status: 404 });
  }

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

  let body: { status?: string; time_spent_seconds?: number; quiz_score?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validStatuses = ["not_started", "in_progress", "completed"];
  const newStatus = validStatuses.includes(body.status ?? "") ? body.status : undefined;

  // Check for existing progress
  const { data: existing } = await supabaseAdmin
    .from("learning_progress")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .eq("lesson_id", params.lessonId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (newStatus) updates.status = newStatus;
    if (newStatus === "in_progress" && !existing.started_at) updates.started_at = now;
    if (newStatus === "completed") updates.completed_at = now;
    if (body.time_spent_seconds !== undefined) {
      updates.time_spent_seconds = (existing.time_spent_seconds ?? 0) + body.time_spent_seconds;
    }
    if (body.quiz_score !== undefined) updates.quiz_score = body.quiz_score;

    const { data: progress, error } = await supabaseAdmin
      .from("learning_progress")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      return Response.json({ error: "Failed to update progress." }, { status: 500 });
    }

    return Response.json({ progress });
  }

  // Create new progress record
  const { data: progress, error } = await supabaseAdmin
    .from("learning_progress")
    .insert({
      job_seeker_id: auth.user.id,
      lesson_id: params.lessonId,
      status: newStatus ?? "in_progress",
      started_at: now,
      completed_at: newStatus === "completed" ? now : null,
      time_spent_seconds: body.time_spent_seconds ?? 0,
      quiz_score: body.quiz_score ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to create progress." }, { status: 500 });
  }

  return Response.json({ progress }, { status: 201 });
}
