import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { getOpenAIClient, OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";
import {
  DEFAULT_JOBGENIUS_REPORT_SETTINGS,
  normalizeJobGeniusReport,
  type JobGeniusReportSettings,
} from "@/lib/jobgenius/report";

interface RouteParams {
  params: { id: string };
}

type GeneratePayload = {
  goal?: string;
  admin_input?: string;
};

type SeekerRow = {
  id: string;
  full_name: string | null;
  email: string;
  location: string | null;
  bio: string | null;
  seniority: string | null;
  years_experience: number | null;
  target_titles: string[] | null;
  skills: string[] | null;
  work_type_preferences: string[] | null;
  employment_type_preferences: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  preferred_industries: string[] | null;
  preferred_company_sizes: string[] | null;
  location_preferences: unknown;
  open_to_relocation: boolean | null;
  work_history: unknown;
  education: unknown;
  authorized_to_work: boolean | null;
  requires_visa_sponsorship: boolean | null;
  citizenship_status: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  profile_completion: number | null;
};

async function loadSettings(): Promise<JobGeniusReportSettings> {
  const { data, error } = await supabaseAdmin
    .from("jobgenius_report_settings")
    .select("settings_key, system_prompt, output_instructions, default_goal")
    .eq("settings_key", DEFAULT_JOBGENIUS_REPORT_SETTINGS.settings_key)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_JOBGENIUS_REPORT_SETTINGS;
  }

  return {
    settings_key:
      typeof data.settings_key === "string"
        ? data.settings_key
        : DEFAULT_JOBGENIUS_REPORT_SETTINGS.settings_key,
    system_prompt:
      typeof data.system_prompt === "string" && data.system_prompt.trim()
        ? data.system_prompt
        : DEFAULT_JOBGENIUS_REPORT_SETTINGS.system_prompt,
    output_instructions:
      typeof data.output_instructions === "string" &&
      data.output_instructions.trim()
        ? data.output_instructions
        : DEFAULT_JOBGENIUS_REPORT_SETTINGS.output_instructions,
    default_goal:
      typeof data.default_goal === "string" && data.default_goal.trim()
        ? data.default_goal
        : DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal,
  };
}

function summarizeSeeker(seeker: SeekerRow): string {
  const summary = {
    full_name: seeker.full_name,
    email: seeker.email,
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
  };

  return JSON.stringify(summary, null, 2);
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = params.id;
  if (!(await hasJobSeekerAccess(auth.user.id, seekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ error: "OpenAI is not configured." }, { status: 503 });
  }

  let payload: GeneratePayload = {};
  try {
    payload = (await request.json()) as GeneratePayload;
  } catch {
    payload = {};
  }

  const { data: seeker, error: seekerError } = await supabaseAdmin
    .from("job_seekers")
    .select(
      "id, full_name, email, location, bio, seniority, years_experience, target_titles, skills, work_type_preferences, employment_type_preferences, salary_min, salary_max, preferred_industries, preferred_company_sizes, location_preferences, open_to_relocation, work_history, education, authorized_to_work, requires_visa_sponsorship, citizenship_status, linkedin_url, portfolio_url, profile_completion"
    )
    .eq("id", seekerId)
    .single();

  if (seekerError || !seeker) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }

  const settings = await loadSettings();
  const goal =
    typeof payload.goal === "string" && payload.goal.trim()
      ? payload.goal.trim()
      : settings.default_goal;
  const adminInput =
    typeof payload.admin_input === "string" ? payload.admin_input.trim() : "";

  const profileSummary = summarizeSeeker(seeker as SeekerRow);

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      max_tokens: 1600,
      messages: [
        {
          role: "system",
          content: `${settings.system_prompt}\n\n${settings.output_instructions}\n\nReturn only valid JSON with these keys:\n{\n  "title": string,\n  "profile_readiness": string,\n  "summary": string,\n  "analysis": string[],\n  "action_steps": [{ "step": string, "why": string, "timeline": string, "priority": string }],\n  "suggestions": string[],\n  "next_steps": string[]\n}\n\nRules:\n- Keep the summary to 3-5 sentences.\n- Include 4-8 analysis points tied to the profile.\n- Include 5-10 action steps with timeline and priority.\n- Include realistic suggestions focused on interview pipeline, profile quality, and search strategy.\n- Keep language direct and practical.`,
        },
        {
          role: "user",
          content: [
            `Goal: ${goal}`,
            adminInput ? `Admin inputs: ${adminInput}` : "Admin inputs: none provided.",
            `Job seeker profile JSON:\n${profileSummary}`,
          ].join("\n\n"),
        },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      return NextResponse.json(
        { error: "No report content generated." },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        summary: text,
        analysis: [text],
      };
    }

    const report = normalizeJobGeniusReport(parsed);
    const generatedAt = new Date().toISOString();

    return NextResponse.json({
      report,
      goal,
      admin_input: adminInput,
      generated_at: generatedAt,
      settings_key: settings.settings_key,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate JobGenius report: ${message}` },
      { status: 500 }
    );
  }
}
