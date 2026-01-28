import { supabaseServer } from "@/lib/supabase/server";

const DEMO_AM_EMAIL = "demo.am@jobgenius.local";
const DEMO_SEEKER_EMAIL = "demo.seeker@jobgenius.local";
const DEMO_JOB_URLS = [
  "https://example.com/jobs/demo-frontend",
  "https://example.com/jobs/demo-backend",
];

export async function POST() {
  const { data: am } = await supabaseServer
    .from("account_managers")
    .select("id")
    .eq("email", DEMO_AM_EMAIL)
    .maybeSingle();

  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("id")
    .eq("email", DEMO_SEEKER_EMAIL)
    .maybeSingle();

  const { data: jobPosts } = await supabaseServer
    .from("job_posts")
    .select("id")
    .in("url", DEMO_JOB_URLS);

  const jobPostIds = (jobPosts ?? []).map((post) => post.id);

  if (seeker?.id) {
    const { data: runRows } = await supabaseServer
      .from("application_runs")
      .select("id")
      .eq("job_seeker_id", seeker.id);
    const runIds = (runRows ?? []).map((row) => row.id);

    if (runIds.length > 0) {
      await supabaseServer.from("apply_run_events").delete().in("run_id", runIds);
      await supabaseServer
        .from("application_step_events")
        .delete()
        .in("run_id", runIds);
    }

    await supabaseServer
      .from("application_runs")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer
      .from("application_queue")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer
      .from("job_match_scores")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer
      .from("job_routing_decisions")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer
      .from("outreach_drafts")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer
      .from("outreach_contacts")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer
      .from("interview_prep")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer
      .from("otp_inbox")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer
      .from("job_seeker_assignments")
      .delete()
      .eq("job_seeker_id", seeker.id);

    await supabaseServer.from("job_seekers").delete().eq("id", seeker.id);
  }

  if (jobPostIds.length > 0) {
    await supabaseServer.from("job_posts").delete().in("id", jobPostIds);
  }

  if (am?.id) {
    await supabaseServer.from("account_managers").delete().eq("id", am.id);
  }

  return Response.json({ success: true });
}
