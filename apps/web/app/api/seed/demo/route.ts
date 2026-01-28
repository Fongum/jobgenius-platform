import { supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  const accountManager = {
    name: "Demo AM",
    email: "demo.am@jobgenius.local",
  };

  const jobSeeker = {
    full_name: "Demo Job Seeker",
    email: "demo.seeker@jobgenius.local",
    location: "New York, NY",
    seniority: "senior",
    salary_min: 120000,
    salary_max: 180000,
    work_type: "remote",
    target_titles: ["Software Engineer", "Full Stack Engineer"],
    skills: ["JavaScript", "TypeScript", "React", "Node", "PostgreSQL"],
    resume_text: "Senior full stack engineer with experience in React and Node.",
    resume_url: "https://example.com/assets/resume.pdf",
  };

  const demoJobs = [
    {
      url: "https://example.com/jobs/demo-frontend",
      title: "Demo Frontend Engineer",
      company: "DemoCorp",
      location: "Remote",
      description_text: "Build UI features and collaborate with product teams.",
      source: "seed",
      ats_type: "LINKEDIN",
    },
    {
      url: "https://example.com/jobs/demo-backend",
      title: "Demo Backend Engineer",
      company: "DemoCorp",
      location: "Remote",
      description_text: "Build APIs and data pipelines.",
      source: "seed",
      ats_type: "GREENHOUSE",
    },
    {
      url: "https://example.com/jobs/demo-platform",
      title: "Demo Platform Engineer",
      company: "DemoCorp",
      location: "Remote",
      description_text: "Build infra tools and platform services.",
      source: "seed",
      ats_type: "WORKDAY",
    },
    {
      url: "https://example.com/jobs/demo-qa",
      title: "Demo QA Engineer",
      company: "DemoCorp",
      location: "Remote",
      description_text: "Create test plans and own QA automation.",
      source: "seed",
      ats_type: "GREENHOUSE",
    },
  ];

  const { data: amData, error: amError } = await supabaseServer
    .from("account_managers")
    .upsert(accountManager, { onConflict: "email" })
    .select("id")
    .single();

  if (amError) {
    return Response.json(
      { success: false, error: "Failed to seed account manager." },
      { status: 500 }
    );
  }

  const { data: jsData, error: jsError } = await supabaseServer
    .from("job_seekers")
    .upsert(jobSeeker, { onConflict: "email" })
    .select("id")
    .single();

  if (jsError) {
    return Response.json(
      { success: false, error: "Failed to seed job seeker." },
      { status: 500 }
    );
  }

  const { error: assignmentError } = await supabaseServer
    .from("job_seeker_assignments")
    .upsert(
      {
        job_seeker_id: jsData.id,
        account_manager_id: amData.id,
      },
      { onConflict: "job_seeker_id" }
    );

  if (assignmentError) {
    return Response.json(
      { success: false, error: "Failed to seed assignment." },
      { status: 500 }
    );
  }

  const jobIds: string[] = [];
  for (const job of demoJobs) {
    const { data: jobData, error: jobError } = await supabaseServer
      .from("job_posts")
      .upsert(
        {
          url: job.url,
          title: job.title,
          company: job.company,
          location: job.location,
          description_text: job.description_text,
          source: job.source,
        },
        { onConflict: "url" }
      )
      .select("id")
      .single();

    if (jobError || !jobData) {
      return Response.json(
        { success: false, error: "Failed to seed job posts." },
        { status: 500 }
      );
    }

    jobIds.push(jobData.id);
  }

  await supabaseServer.from("saved_jobs").upsert(
    {
      url: demoJobs[0].url,
      title: demoJobs[0].title,
      company: demoJobs[0].company,
      location: demoJobs[0].location,
    },
    { onConflict: "url" }
  );

  await supabaseServer.from("job_match_scores").upsert(
    [
      {
        job_post_id: jobIds[0],
        job_seeker_id: jsData.id,
        score: 82,
        reasons: {
          skills: 90,
          title_similarity: 85,
          location: 70,
          seniority: 80,
          work_type: 95,
        },
      },
      {
        job_post_id: jobIds[1],
        job_seeker_id: jsData.id,
        score: 74,
        reasons: {
          skills: 75,
          title_similarity: 72,
          location: 70,
          seniority: 65,
          work_type: 85,
        },
      },
      {
        job_post_id: jobIds[2],
        job_seeker_id: jsData.id,
        score: 69,
        reasons: {
          skills: 70,
          title_similarity: 68,
          location: 70,
          seniority: 60,
          work_type: 80,
        },
      },
      {
        job_post_id: jobIds[3],
        job_seeker_id: jsData.id,
        score: 55,
        reasons: {
          skills: 58,
          title_similarity: 50,
          location: 65,
          seniority: 50,
          work_type: 75,
        },
      },
    ],
    { onConflict: "job_post_id,job_seeker_id" }
  );

  const runIds: Record<string, string> = {};

  const nowIso = new Date().toISOString();
  for (let index = 0; index < 3; index += 1) {
    const demoJob = demoJobs[index];
    const queueInsert = await supabaseServer
      .from("application_queue")
      .insert({
        job_post_id: jobIds[index],
        job_seeker_id: jsData.id,
        status: "READY",
        category: "matched",
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (queueInsert.error || !queueInsert.data) {
      return Response.json(
        { success: false, error: "Failed to seed queue." },
        { status: 500 }
      );
    }

    const { data: existingRun } = await supabaseServer
      .from("application_runs")
      .select("id")
      .eq("queue_id", queueInsert.data.id)
      .maybeSingle();

    if (!existingRun) {
      const { data: runData, error: runError } = await supabaseServer
        .from("application_runs")
        .insert({
          queue_id: queueInsert.data.id,
          job_seeker_id: jsData.id,
          job_post_id: jobIds[index],
          ats_type: demoJob.ats_type,
          status: "READY",
          current_step: "OPEN_JOB",
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (runError || !runData) {
        return Response.json(
          { success: false, error: "Failed to seed runs." },
          { status: 500 }
        );
      }

      runIds[demoJob.ats_type] = runData.id;
    }
  }

  const { data: attentionQueue } = await supabaseServer
    .from("application_queue")
    .insert({
      job_post_id: jobIds[3],
      job_seeker_id: jsData.id,
      status: "NEEDS_ATTENTION",
      category: "needs_attention",
      last_error: "SMS OTP required.",
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (attentionQueue) {
    const { data: attentionRun } = await supabaseServer
      .from("application_runs")
      .insert({
        queue_id: attentionQueue.id,
        job_seeker_id: jsData.id,
        job_post_id: jobIds[3],
        ats_type: demoJobs[3].ats_type,
        status: "NEEDS_ATTENTION",
        current_step: "SUBMIT",
        needs_attention_reason: "SMS_OTP",
        last_error: "SMS OTP required.",
        last_error_code: "SMS_OTP",
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (attentionRun) {
      runIds["NEEDS_ATTENTION"] = attentionRun.id;
      await supabaseServer.from("apply_run_events").insert({
        run_id: attentionRun.id,
        level: "WARN",
        event_type: "NEEDS_ATTENTION",
        actor: "SYSTEM",
        payload: { reason: "SMS_OTP" },
      });
    }
  }

  return Response.json({
    success: true,
    account_manager_id: amData.id,
    job_seeker_id: jsData.id,
    job_post_ids: jobIds,
    run_ids: runIds,
    saved_job_url: demoJobs[0].url,
  });
}
