import { normalizeJobTitle } from "@/lib/resume-bank";

export async function maybeUpsertResumeHardeningAlert(params: {
  supabase: any;
  jobSeekerId: string;
  jobTitle: string;
  threshold?: number;
}) {
  const threshold = Math.max(1, params.threshold ?? 5);
  const normalized = normalizeJobTitle(params.jobTitle);

  if (!normalized) {
    return { triggered: false, reason: "empty_title" as const };
  }

  const { data: tailoredRows, error: tailoredError } = await params.supabase
    .from("tailored_resumes")
    .select("job_post_id")
    .eq("job_seeker_id", params.jobSeekerId);

  if (tailoredError) {
    return {
      triggered: false,
      reason: "tailored_query_failed" as const,
      error: tailoredError.message,
    };
  }

  const jobPostIds = Array.from(
    new Set((tailoredRows ?? []).map((row: { job_post_id?: string }) => row.job_post_id).filter(Boolean))
  ) as string[];

  if (jobPostIds.length === 0) {
    return { triggered: false, reason: "no_tailored_rows" as const };
  }

  const { data: jobPosts, error: jobPostsError } = await params.supabase
    .from("job_posts")
    .select("id, title")
    .in("id", jobPostIds);

  if (jobPostsError) {
    return {
      triggered: false,
      reason: "job_posts_query_failed" as const,
      error: jobPostsError.message,
    };
  }

  let count = 0;
  for (const post of jobPosts ?? []) {
    const postTitle = normalizeJobTitle(post.title);
    if (postTitle && postTitle === normalized) {
      count += 1;
    }
  }

  if (count < threshold) {
    return { triggered: false, reason: "below_threshold" as const, count };
  }

  const { data: existingPending } = await params.supabase
    .from("resume_hardening_alerts")
    .select("id, tailored_count")
    .eq("job_seeker_id", params.jobSeekerId)
    .eq("normalized_title", normalized)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending?.id) {
    await params.supabase
      .from("resume_hardening_alerts")
      .update({
        tailored_count: count,
        sample_title: params.jobTitle,
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingPending.id);

    return { triggered: true, alertId: existingPending.id, count, created: false };
  }

  const { error: insertError } = await params.supabase
    .from("resume_hardening_alerts")
    .insert({
      job_seeker_id: params.jobSeekerId,
      normalized_title: normalized,
      sample_title: params.jobTitle,
      tailored_count: count,
      status: "pending",
      last_triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (insertError) {
    return {
      triggered: false,
      reason: "alert_upsert_failed" as const,
      count,
      error: insertError.message,
    };
  }

  return { triggered: true, count, created: true };
}
