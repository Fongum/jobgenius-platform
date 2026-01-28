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
    },
    {
      url: "https://example.com/jobs/demo-backend",
      title: "Demo Backend Engineer",
      company: "DemoCorp",
      location: "Remote",
      description_text: "Build APIs and data pipelines.",
      source: "seed",
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
      .upsert(job, { onConflict: "url" })
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
        score: 58,
        reasons: {
          skills: 60,
          title_similarity: 55,
          location: 70,
          seniority: 50,
          work_type: 80,
        },
      },
    ],
    { onConflict: "job_post_id,job_seeker_id" }
  );

  const { data: queueItem, error: queueError } = await supabaseServer
    .from("application_queue")
    .insert({
      job_post_id: jobIds[0],
      job_seeker_id: jsData.id,
      status: "READY",
      category: "matched",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (queueError || !queueItem) {
    return Response.json(
      { success: false, error: "Failed to seed queue." },
      { status: 500 }
    );
  }

  const { data: existingRun } = await supabaseServer
    .from("application_runs")
    .select("id")
    .eq("queue_id", queueItem.id)
    .maybeSingle();

  if (!existingRun) {
    await supabaseServer.from("application_runs").insert({
      queue_id: queueItem.id,
      job_seeker_id: jsData.id,
      job_post_id: jobIds[0],
      ats_type: "LINKEDIN",
      status: "READY",
      current_step: "OPEN_JOB",
      updated_at: new Date().toISOString(),
    });
  }

  const { data: attentionQueue } = await supabaseServer
    .from("application_queue")
    .insert({
      job_post_id: jobIds[1],
      job_seeker_id: jsData.id,
      status: "NEEDS_ATTENTION",
      category: "needs_attention",
      last_error: "Captcha detected.",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (attentionQueue) {
    const { data: attentionRun } = await supabaseServer
      .from("application_runs")
      .insert({
        queue_id: attentionQueue.id,
        job_seeker_id: jsData.id,
        job_post_id: jobIds[1],
        ats_type: "GREENHOUSE",
        status: "NEEDS_ATTENTION",
        current_step: "SUBMIT",
        needs_attention_reason: "CAPTCHA",
        last_error: "Captcha detected.",
        last_error_code: "CAPTCHA",
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (attentionRun) {
      await supabaseServer.from("apply_run_events").insert({
        run_id: attentionRun.id,
        level: "WARN",
        event_type: "NEEDS_ATTENTION",
        actor: "SYSTEM",
        payload: { reason: "CAPTCHA" },
      });
    }
  }

  return Response.json({
    success: true,
    account_manager_id: amData.id,
    job_seeker_id: jsData.id,
    job_post_ids: jobIds,
  });
}
