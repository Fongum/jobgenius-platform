import { supabaseAdmin } from "@/lib/auth";
import {
  buildCandidateContextBlock,
  candidateFromSeekerRow,
  candidateHasResume,
  type InterviewCandidateContext,
} from "@/lib/portal/candidate-context";

// Re-exported so existing importers (evaluator, routes) keep working.
export { buildCandidateContextBlock };
export type { InterviewCandidateContext };

export type InterviewPersona = "professional" | "technical" | "behavioral" | "stress";

export const INTERVIEW_PERSONAS: InterviewPersona[] = [
  "professional",
  "technical",
  "behavioral",
  "stress",
];

const PERSONA_DESCRIPTIONS: Record<InterviewPersona, string> = {
  professional: "a friendly but thorough HR interviewer",
  technical: "a senior engineer conducting a technical screen",
  behavioral: "a hiring manager focused on culture fit and leadership",
  stress: "a direct, challenging interviewer who pushes back on vague answers",
};

export type InterviewJobContext = {
  title: string;
  company: string | null;
  description: string | null;
};

export type InterviewContext = {
  job: InterviewJobContext;
  candidate: InterviewCandidateContext;
  hasResume: boolean;
};

export function normalizePersona(value: unknown): InterviewPersona {
  return INTERVIEW_PERSONAS.includes(value as InterviewPersona)
    ? (value as InterviewPersona)
    : "professional";
}

/**
 * Load the job + candidate (resume) context for a given interview prep record.
 * Returns null if the prep record does not exist / is not owned by the seeker.
 */
export async function loadInterviewContext(
  prepId: string,
  jobSeekerId: string
): Promise<InterviewContext | null> {
  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("id, job_post_id, job_seeker_id")
    .eq("id", prepId)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!prep) return null;

  const job: InterviewJobContext = {
    title: "the role",
    company: null,
    description: null,
  };

  if (prep.job_post_id) {
    const { data: jobPost } = await supabaseAdmin
      .from("job_posts")
      .select("title, company, description_text")
      .eq("id", prep.job_post_id)
      .maybeSingle();
    if (jobPost) {
      job.title = (jobPost.title as string | null) ?? "the role";
      job.company = (jobPost.company as string | null) ?? null;
      job.description = (jobPost.description_text as string | null) ?? null;
    }
  }

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("full_name, skills, work_history, education")
    .eq("id", jobSeekerId)
    .maybeSingle();

  const candidate: InterviewCandidateContext = candidateFromSeekerRow(seeker);
  const hasResume = candidateHasResume(candidate);

  return { job, candidate, hasResume };
}

/**
 * Build the system instructions for the live Realtime interviewer, grounded in
 * the job description AND the candidate's résumé so questions are personalized.
 */
export function buildRealtimeInstructions(
  persona: InterviewPersona,
  context: InterviewContext
): string {
  const personaText = PERSONA_DESCRIPTIONS[persona];
  const company = context.job.company ? ` at ${context.job.company}` : "";
  const description = context.job.description
    ? `\n\nJob description:\n${context.job.description.slice(0, 1500)}`
    : "";
  const resumeBlock = buildCandidateContextBlock(context.candidate);
  const resumeText = resumeBlock ? `\n\n${resumeBlock}` : "";

  return `You are ${personaText}. You are conducting a realistic mock interview for the position of ${context.job.title}${company}.

Rules:
- Ask one question at a time and keep questions concise and role-specific.
- Personalize questions using the candidate's résumé below — probe their actual past roles, skills, and projects.
- Ask natural follow-ups that push for specifics (metrics, scope, their personal contribution).
- Encourage STAR-structured answers (Situation, Task, Action, Result) but do not lecture.
- After 6-8 exchanges, wrap up and ask if the candidate has questions.
- Do not mention that you are an AI.${description}${resumeText}`;
}
