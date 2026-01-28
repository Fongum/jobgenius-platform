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
  };

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

  return Response.json({
    success: true,
    account_manager_id: amData.id,
    job_seeker_id: jsData.id,
  });
}
