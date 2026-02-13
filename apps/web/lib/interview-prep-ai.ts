import {
  getOpenAIClient,
  OPENAI_MODEL,
  isOpenAIConfigured,
} from "@/lib/openai";
import { buildInterviewPrepContent } from "@/lib/interview-prep";

type InterviewPrepContent = {
  role_summary: string;
  company_notes: string[];
  likely_questions: string[];
  answer_structure: string[];
  technical_topics: string[];
  behavioral_topics: string[];
  checklist: string[];
  thirty_sixty_ninety: string[];
};

export async function buildInterviewPrepContentWithAI({
  jobTitle,
  companyName,
  descriptionText,
  location,
  seniority,
  workType,
  seekerSkills,
}: {
  jobTitle: string;
  companyName?: string | null;
  descriptionText?: string | null;
  location?: string | null;
  seniority?: string | null;
  workType?: string | null;
  seekerSkills?: string[] | null;
}): Promise<InterviewPrepContent> {
  if (!isOpenAIConfigured()) {
    return buildInterviewPrepContent({
      jobTitle,
      companyName,
      descriptionText,
      location,
      seniority,
      workType,
    });
  }

  try {
    const client = getOpenAIClient();

    const contextParts = [
      `Job title: ${jobTitle}`,
      companyName ? `Company: ${companyName}` : null,
      location ? `Location: ${location}` : null,
      seniority ? `Seniority level: ${seniority}` : null,
      workType ? `Work type: ${workType}` : null,
      seekerSkills && seekerSkills.length > 0
        ? `Candidate skills: ${seekerSkills.join(", ")}`
        : null,
      descriptionText
        ? `Job description:\n${descriptionText.slice(0, 3000)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a senior career coach creating personalized interview preparation materials. Generate content tailored to the specific company and role — not generic templates.

Return a JSON object with exactly these fields:
- "role_summary": 2-3 sentence summary of the role, what the team likely does, and what the hiring manager is looking for
- "company_notes": array of 4-6 company research notes (recent news, culture, products, competitors, mission — be specific to THIS company)
- "likely_questions": array of 15-20 interview questions (mix of behavioral, technical, role-specific, and company-specific — NOT generic questions)
- "answer_structure": array of 4 STAR method steps with role-specific examples woven in
- "technical_topics": array of 5-8 technical topics to prepare (extracted from the actual job description, not generic)
- "behavioral_topics": array of 4-6 behavioral themes likely to come up based on the role and seniority
- "checklist": array of 6-8 concrete prep tasks (company-specific research, specific stories to prepare, logistics)
- "thirty_sixty_ninety": array of 3 items — what to focus on in the first 30, 60, and 90 days in this specific role

Make questions specific: instead of "Tell me about a challenge" write "Describe a time you had to debug a production issue under time pressure" for an engineering role.
If the company name is provided, include company-specific questions like "What interests you about [Company]'s approach to [domain]?"
Tailor technical topics to what's actually in the job description.`,
        },
        {
          role: "user",
          content: contextParts,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return buildInterviewPrepContent({
        jobTitle,
        companyName,
        descriptionText,
        location,
        seniority,
        workType,
      });
    }

    const parsed = JSON.parse(text);

    return {
      role_summary: parsed.role_summary || `${jobTitle} role`,
      company_notes: ensureArray(parsed.company_notes, 2),
      likely_questions: ensureArray(parsed.likely_questions, 15),
      answer_structure: ensureArray(parsed.answer_structure, 4),
      technical_topics: ensureArray(parsed.technical_topics, 2),
      behavioral_topics: ensureArray(parsed.behavioral_topics, 2),
      checklist: ensureArray(parsed.checklist, 4),
      thirty_sixty_ninety: ensureArray(parsed.thirty_sixty_ninety, 3),
    };
  } catch {
    return buildInterviewPrepContent({
      jobTitle,
      companyName,
      descriptionText,
      location,
      seniority,
      workType,
    });
  }
}

function ensureArray(value: unknown, minLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const strings = value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(0, 30);
  if (strings.length < minLength) return strings;
  return strings;
}
