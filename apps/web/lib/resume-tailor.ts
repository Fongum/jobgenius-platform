import { getOpenAIClient, OPENAI_MODEL } from "./openai";
import type { StructuredResume } from "./resume-templates/types";

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

export interface TailorResumeStructuredInput {
  baseResume: StructuredResume;
  jobTitle: string;
  company: string | null;
  jobDescription: string | null;
  requiredSkills: string[] | null;
  preferredSkills: string[] | null;
}

export interface TailorResumeStructuredResult {
  tailoredData: StructuredResume;
  tailoredText: string;
  changesSummary: string;
}

export interface OptimizeBaseResumeStructuredInput {
  baseResume: StructuredResume;
  targetTitles: string[] | null;
  seniority: string | null;
  preferredIndustries: string[] | null;
  keySkills: string[] | null;
}

export interface SeekerRow {
  full_name: string | null;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  address_city: string | null;
  address_state: string | null;
  bio: string | null;
  skills: string[] | null;
  work_history: unknown;
  education: unknown;
  resume_text: string | null;
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

function structuredResumeToText(data: StructuredResume): string {
  const lines: string[] = [];
  const c = data.contact;
  lines.push(c.fullName);
  const contactParts = [c.email, c.phone, c.location, c.linkedinUrl, c.portfolioUrl].filter(Boolean);
  if (contactParts.length) lines.push(contactParts.join(" | "));
  lines.push("");

  if (data.summary) {
    lines.push("SUMMARY");
    lines.push(data.summary);
    lines.push("");
  }

  if (data.workExperience.length) {
    lines.push("WORK EXPERIENCE");
    for (const w of data.workExperience) {
      lines.push(`${w.title} - ${w.company}${w.location ? `, ${w.location}` : ""}`);
      lines.push(`${w.startDate} - ${w.endDate}`);
      for (const b of w.bullets) lines.push(`  - ${b}`);
      lines.push("");
    }
  }

  if (data.education.length) {
    lines.push("EDUCATION");
    for (const e of data.education) {
      lines.push(`${e.degree}${e.field ? ` in ${e.field}` : ""} - ${e.institution}`);
      lines.push(e.graduationDate);
      if (e.gpa) lines.push(`GPA: ${e.gpa}`);
      if (e.honors) lines.push(e.honors);
      lines.push("");
    }
  }

  if (data.skills.length) {
    lines.push("SKILLS");
    lines.push(data.skills.join(", "));
    lines.push("");
  }

  if (data.certifications.length) {
    lines.push("CERTIFICATIONS");
    for (const cert of data.certifications) {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      lines.push(parts.join(" - "));
    }
  }

  return lines.join("\n");
}

const STRUCTURED_RESUME_SCHEMA = `{
  "contact": { "fullName": string, "email": string, "phone": string|null, "location": string|null, "linkedinUrl": string|null, "portfolioUrl": string|null },
  "summary": string,
  "workExperience": [{ "title": string, "company": string, "location": string|null, "startDate": string, "endDate": string, "bullets": string[] }],
  "education": [{ "degree": string, "institution": string, "field": string|null, "graduationDate": string, "gpa": string|null, "honors": string|null }],
  "skills": string[],
  "certifications": [{ "name": string, "issuer": string|null, "date": string|null }]
}`;

export async function tailorResumeStructured(
  input: TailorResumeStructuredInput
): Promise<TailorResumeStructuredResult> {
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
        content: `You are a professional resume writer. Tailor the candidate's structured resume JSON to better match the job posting.

Rules:
- Reorder and emphasize relevant experience and skills
- Adjust language to mirror the job posting's terminology
- Highlight transferable skills that match the job requirements
- NEVER fabricate experience, skills, or qualifications
- NEVER remove truthful information, only adjust emphasis and ordering
- Keep the resume professional and concise

Respond with valid JSON containing two fields:
- "tailored_resume": a JSON object matching this schema: ${STRUCTURED_RESUME_SCHEMA}
- "changes_summary": a brief bullet-point summary of what was changed and why (2-5 bullets)`,
      },
      {
        role: "user",
        content: `Tailor this resume for the following job:\n\n${jobContext}\n\n---\n\nOriginal Resume (JSON):\n${JSON.stringify(input.baseResume)}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as {
    tailored_resume: StructuredResume;
    changes_summary: string;
  };

  const tailoredData = parsed.tailored_resume;

  // Basic validation
  if (!tailoredData?.contact?.fullName || !tailoredData?.contact?.email) {
    throw new Error("Invalid structured resume returned by AI: missing contact fields");
  }
  if (!Array.isArray(tailoredData.workExperience)) {
    tailoredData.workExperience = [];
  }
  if (!Array.isArray(tailoredData.education)) {
    tailoredData.education = [];
  }
  if (!Array.isArray(tailoredData.skills)) {
    tailoredData.skills = [];
  }
  if (!Array.isArray(tailoredData.certifications)) {
    tailoredData.certifications = [];
  }

  return {
    tailoredData,
    tailoredText: structuredResumeToText(tailoredData),
    changesSummary: parsed.changes_summary,
  };
}

export async function optimizeBaseResumeStructured(
  input: OptimizeBaseResumeStructuredInput
): Promise<TailorResumeStructuredResult> {
  const openai = getOpenAIClient();

  const profileContext = [
    input.targetTitles?.length
      ? `Target roles: ${input.targetTitles.join(", ")}`
      : "",
    input.seniority ? `Seniority: ${input.seniority}` : "",
    input.preferredIndustries?.length
      ? `Preferred industries: ${input.preferredIndustries.join(", ")}`
      : "",
    input.keySkills?.length
      ? `Core skills to emphasize: ${input.keySkills.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an expert ATS resume strategist. Optimize the candidate's base structured resume so it performs well across many job applications.

Rules:
- Improve ATS readability and keyword density naturally
- Strengthen impact bullets with measurable outcomes when present in source text
- Keep claims truthful and never invent companies, roles, dates, or credentials
- Preserve candidate identity and career direction
- Keep wording concise and professional

Respond with valid JSON containing:
- "tailored_resume": a JSON object matching this schema: ${STRUCTURED_RESUME_SCHEMA}
- "changes_summary": a short bullet summary (3-6 bullets) of optimization changes.`,
      },
      {
        role: "user",
        content: `Optimize this base resume for broad ATS performance.\n\nCandidate context:\n${profileContext || "No additional profile context."}\n\nOriginal Resume (JSON):\n${JSON.stringify(
          input.baseResume
        )}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as {
    tailored_resume: StructuredResume;
    changes_summary: string;
  };

  const tailoredData = parsed.tailored_resume;
  if (!tailoredData?.contact?.fullName || !tailoredData?.contact?.email) {
    throw new Error("Invalid optimized resume returned by AI: missing contact fields");
  }
  if (!Array.isArray(tailoredData.workExperience)) {
    tailoredData.workExperience = [];
  }
  if (!Array.isArray(tailoredData.education)) {
    tailoredData.education = [];
  }
  if (!Array.isArray(tailoredData.skills)) {
    tailoredData.skills = [];
  }
  if (!Array.isArray(tailoredData.certifications)) {
    tailoredData.certifications = [];
  }

  return {
    tailoredData,
    tailoredText: structuredResumeToText(tailoredData),
    changesSummary: parsed.changes_summary,
  };
}

interface WorkHistoryEntry {
  title?: string;
  job_title?: string;
  company?: string;
  company_name?: string;
  location?: string;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  bullets?: string[];
  description?: string;
}

interface EducationEntry {
  degree?: string;
  institution?: string;
  school?: string;
  field?: string;
  field_of_study?: string;
  graduation_date?: string;
  graduationDate?: string;
  gpa?: string;
  honors?: string;
}

export function buildStructuredResumeFromSeeker(seeker: SeekerRow): StructuredResume {
  const locationParts = [seeker.address_city, seeker.address_state].filter(Boolean);

  const workHistory = Array.isArray(seeker.work_history)
    ? (seeker.work_history as WorkHistoryEntry[])
    : [];

  const education = Array.isArray(seeker.education)
    ? (seeker.education as EducationEntry[])
    : [];

  return {
    contact: {
      fullName: seeker.full_name || seeker.email,
      email: seeker.email,
      phone: seeker.phone || null,
      location: locationParts.length > 0 ? locationParts.join(", ") : null,
      linkedinUrl: seeker.linkedin_url || null,
      portfolioUrl: null,
    },
    summary: seeker.bio || "",
    workExperience: workHistory.map((w) => ({
      title: w.title || w.job_title || "",
      company: w.company || w.company_name || "",
      location: w.location || null,
      startDate: w.start_date || w.startDate || "",
      endDate: w.end_date || w.endDate || "Present",
      bullets: Array.isArray(w.bullets)
        ? w.bullets
        : w.description
          ? [w.description]
          : [],
    })),
    education: education.map((e) => ({
      degree: e.degree || "",
      institution: e.institution || e.school || "",
      field: e.field || e.field_of_study || null,
      graduationDate: e.graduation_date || e.graduationDate || "",
      gpa: e.gpa || null,
      honors: e.honors || null,
    })),
    skills: seeker.skills || [],
    certifications: [],
  };
}
