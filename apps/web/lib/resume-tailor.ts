import { getOpenAIClient, OPENAI_MODEL } from "./openai";

interface TailorResumeInput {
  resumeText: string;
  jobTitle: string;
  company: string | null;
  jobDescription: string | null;
  requiredSkills: string[] | null;
  preferredSkills: string[] | null;
}

interface TailorResumeResult {
  tailoredText: string;
  changesSummary: string;
}

export async function tailorResume(input: TailorResumeInput): Promise<TailorResumeResult> {
  const openai = getOpenAIClient();

  const skillsSection = [
    input.requiredSkills?.length ? `Required skills: ${input.requiredSkills.join(", ")}` : "",
    input.preferredSkills?.length ? `Preferred skills: ${input.preferredSkills.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const jobContext = [
    `Job Title: ${input.jobTitle}`,
    input.company ? `Company: ${input.company}` : "",
    input.jobDescription ? `Job Description:\n${input.jobDescription}` : "",
    skillsSection,
  ].filter(Boolean).join("\n\n");

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: `You are a professional resume writer. Your job is to tailor a candidate's resume to better match a specific job posting. You should:
- Reorder and emphasize relevant experience and skills
- Adjust language to mirror the job posting's terminology
- Highlight transferable skills that match the job requirements
- NEVER fabricate experience, skills, or qualifications the candidate doesn't have
- NEVER remove truthful information, only adjust emphasis and ordering
- Keep the resume professional and concise

Respond with valid JSON containing two fields:
- "tailored_resume": the full tailored resume text
- "changes_summary": a brief bullet-point summary of what was changed and why (2-5 bullets)`,
      },
      {
        role: "user",
        content: `Please tailor this resume for the following job:\n\n${jobContext}\n\n---\n\nOriginal Resume:\n${input.resumeText}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as { tailored_resume: string; changes_summary: string };
  return {
    tailoredText: parsed.tailored_resume,
    changesSummary: parsed.changes_summary,
  };
}
