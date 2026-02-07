import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { getOpenAIClient, OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";

interface RouteParams {
  params: { id: string };
}

async function hasAccess(amId: string, seekerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", amId)
    .eq("job_seeker_id", seekerId)
    .maybeSingle();
  return !!data;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;

  if (!(await hasAccess(auth.user.id, id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "OpenAI is not configured." }, { status: 503 });
  }

  // Load full seeker profile
  const { data: seeker, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !seeker) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }

  const profileSummary = JSON.stringify({
    full_name: seeker.full_name,
    location: seeker.location,
    bio: seeker.bio,
    seniority: seeker.seniority,
    years_experience: seeker.years_experience,
    target_titles: seeker.target_titles,
    skills: seeker.skills,
    work_type_preferences: seeker.work_type_preferences,
    employment_type_preferences: seeker.employment_type_preferences,
    salary_min: seeker.salary_min,
    salary_max: seeker.salary_max,
    preferred_industries: seeker.preferred_industries,
    preferred_company_sizes: seeker.preferred_company_sizes,
    location_preferences: seeker.location_preferences,
    open_to_relocation: seeker.open_to_relocation,
    work_history: seeker.work_history,
    education: seeker.education,
    authorized_to_work: seeker.authorized_to_work,
    requires_visa_sponsorship: seeker.requires_visa_sponsorship,
    citizenship_status: seeker.citizenship_status,
    linkedin_url: seeker.linkedin_url,
    portfolio_url: seeker.portfolio_url,
    profile_completion: seeker.profile_completion,
  }, null, 2);

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert job placement analyst. Analyze the following job seeker profile and provide:

1. An assessment of profile completeness and quality for job matching
2. Specific gaps that would hurt application quality or matching accuracy
3. Concrete suggestions for improvements the seeker should make
4. A rating of the profile as one of: "Ready", "Needs Work", or "Incomplete"

Be concise and actionable. Focus on what matters most for getting quality job matches and successful applications.`,
        },
        {
          role: "user",
          content: `Analyze this job seeker profile:\n\n${profileSummary}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const analysisText = completion.choices[0]?.message?.content || "No analysis generated.";

    // Determine rating from the analysis
    let rating = "Needs Work";
    const profileCompletion = seeker.profile_completion ?? 0;
    const hasSkills = (seeker.skills?.length ?? 0) > 0;
    const hasWorkHistory = (seeker.work_history?.length ?? 0) > 0;
    const hasTargetTitles = (seeker.target_titles?.length ?? 0) > 0;

    if (profileCompletion >= 80 && hasSkills && hasWorkHistory && hasTargetTitles) {
      rating = "Ready";
    } else if (profileCompletion < 40 || (!hasSkills && !hasWorkHistory)) {
      rating = "Incomplete";
    }

    return NextResponse.json({ analysis: analysisText, rating });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Analysis failed: ${message}` }, { status: 500 });
  }
}
