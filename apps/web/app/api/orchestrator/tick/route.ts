import { supabaseServer } from "@/lib/supabase/server";

const LOCK_EXPIRY_MINUTES = 10;
const MAX_BATCH = 5;

export async function POST() {
  const lockExpiry = new Date(Date.now() - LOCK_EXPIRY_MINUTES * 60 * 1000);

  const { data: queuedItems, error: queuedError } = await supabaseServer
    .from("application_queue")
    .select("id, job_post_id, job_seeker_id, attempts, meta")
    .eq("status", "QUEUED")
    .or(`locked_at.is.null,locked_at.lt.${lockExpiry.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (queuedError) {
    return Response.json(
      { success: false, error: "Failed to load queue." },
      { status: 500 }
    );
  }

  if (!queuedItems || queuedItems.length === 0) {
    return Response.json({ success: true, processed: 0 });
  }

  const nowIso = new Date().toISOString();

  for (const item of queuedItems) {
    const { error: lockError } = await supabaseServer
      .from("application_queue")
      .update({
        status: "RUNNING",
        attempts: (item.attempts ?? 0) + 1,
        locked_by: "orchestrator",
        locked_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", item.id);

    if (lockError) {
      return Response.json(
        { success: false, error: "Failed to lock queue items." },
        { status: 500 }
      );
    }
  }

  const { data: jobPosts, error: postsError } = await supabaseServer
    .from("job_posts")
    .select("id, source")
    .in(
      "id",
      queuedItems.map((item) => item.job_post_id)
    );

  if (postsError) {
    return Response.json(
      { success: false, error: "Failed to load job posts." },
      { status: 500 }
    );
  }

  const postSourceMap = new Map(
    (jobPosts ?? []).map((post) => [post.id, post.source])
  );

  for (const item of queuedItems) {
    const source = postSourceMap.get(item.job_post_id);
    const needsAttention =
      item.meta?.captcha_required === true ||
      (source === "linkedin" && item.attempts === 0);

    const baseEvents = [
      {
        queue_id: item.id,
        event_type: "STARTED",
        message: "Orchestrator started processing.",
      },
      {
        queue_id: item.id,
        event_type: "STEP",
        message: "resume_customization",
      },
      {
        queue_id: item.id,
        event_type: "STEP",
        message: "apply_agent",
      },
    ];

    await supabaseServer.from("application_events").insert(baseEvents);

    if (needsAttention) {
      await supabaseServer
        .from("application_queue")
        .update({
          status: "NEEDS_ATTENTION",
          last_error: "Captcha or manual step required.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      await supabaseServer.from("application_events").insert({
        queue_id: item.id,
        event_type: "NEEDS_ATTENTION",
        message: "Paused for manual attention.",
      });

      await supabaseServer.from("attention_items").insert({
        queue_id: item.id,
        status: "OPEN",
        reason: "Captcha or manual step required.",
      });

      continue;
    }

    await supabaseServer
      .from("application_queue")
      .update({
        status: "COMPLETED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    await supabaseServer.from("application_events").insert({
      queue_id: item.id,
      event_type: "COMPLETED",
      message: "Application completed.",
    });
  }

  return Response.json({ success: true, processed: queuedItems.length });
}
