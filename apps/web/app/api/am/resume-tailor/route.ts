import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isOpenAIConfigured } from "@/lib/openai";
import { tailorResume } from "@/lib/resume-tailor";

async function hasAccess(amId: string, seekerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", amId)
    .eq("job_seeker_id", seekerId)
    .maybeSingle();
  return !!data;
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "OpenAI is not configured. Set OPENAI_API_KEY to enable resume tailoring." },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { job_seeker_id, job_post_id } = body;

  if (!job_seeker_id || !job_post_id) {
    return NextResponse.json(
      { error: "job_seeker_id and job_post_id are required." },
      { status: 400 }
    );
  }

  if (!(await hasAccess(auth.user.id, job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const [{ data: seeker }, { data: jobPost }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("resume_text")
      .eq("id", job_seeker_id)
      .maybeSingle(),
    supabaseAdmin
      .from("job_posts")
      .select("id, title, company, description_text, required_skills, preferred_skills")
      .eq("id", job_post_id)
      .single(),
  ]);

  if (!seeker?.resume_text) {
    return NextResponse.json(
      { error: "Job seeker has no resume text on file." },
      { status: 400 }
    );
  }

  if (!jobPost) {
    return NextResponse.json({ error: "Job post not found." }, { status: 404 });
  }

  try {
    const result = await tailorResume({
      resumeText: seeker.resume_text,
      jobTitle: jobPost.title,
      company: jobPost.company,
      jobDescription: jobPost.description_text,
      requiredSkills: jobPost.required_skills,
      preferredSkills: jobPost.preferred_skills,
    });

    const { data: upserted, error: upsertError } = await supabaseAdmin
      .from("tailored_resumes")
      .upsert(
        {
          job_seeker_id,
          job_post_id,
          original_text: seeker.resume_text,
          tailored_text: result.tailoredText,
          changes_summary: result.changesSummary,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_seeker_id,job_post_id" }
      )
      .select()
      .single();

    if (upsertError) {
      return NextResponse.json(
        { error: "Failed to save tailored resume." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tailored_resume: upserted,
      changes_summary: result.changesSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Resume tailoring failed: ${message}` },
      { status: 500 }
    );
  }
}
