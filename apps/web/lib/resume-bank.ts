import type { StructuredResume } from "@/lib/resume-templates";

function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function normalizeJobTitle(title: string | null | undefined): string {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function structuredResumeToText(data: StructuredResume): string {
  const lines: string[] = [];
  const contact = data.contact;

  lines.push(contact.fullName);
  const parts = [
    contact.email,
    contact.phone,
    contact.location,
    contact.linkedinUrl,
    contact.portfolioUrl,
  ].filter(Boolean);
  if (parts.length > 0) {
    lines.push(parts.join(" | "));
  }

  if (data.summary) {
    lines.push("", "SUMMARY", data.summary);
  }

  if (Array.isArray(data.workExperience) && data.workExperience.length > 0) {
    lines.push("", "WORK EXPERIENCE");
    for (const row of data.workExperience) {
      lines.push(`${row.title} - ${row.company}`);
      lines.push(`${row.startDate} - ${row.endDate}`);
      for (const bullet of row.bullets ?? []) {
        lines.push(`- ${bullet}`);
      }
    }
  }

  if (Array.isArray(data.education) && data.education.length > 0) {
    lines.push("", "EDUCATION");
    for (const row of data.education) {
      lines.push(`${row.degree}${row.field ? ` in ${row.field}` : ""} - ${row.institution}`);
      lines.push(row.graduationDate);
    }
  }

  if (Array.isArray(data.skills) && data.skills.length > 0) {
    lines.push("", "SKILLS", data.skills.join(", "));
  }

  if (Array.isArray(data.certifications) && data.certifications.length > 0) {
    lines.push("", "CERTIFICATIONS");
    for (const row of data.certifications) {
      lines.push([row.name, row.issuer, row.date].filter(Boolean).join(" - "));
    }
  }

  return lines.join("\n");
}

function scoreKeywordCoverage(resumeText: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const lower = resumeText.toLowerCase();
  let hit = 0;
  for (const keyword of keywords) {
    if (!keyword) continue;
    if (lower.includes(keyword.toLowerCase())) {
      hit += 1;
    }
  }
  return hit / keywords.length;
}

function getJobKeywords(jobTitle: string, jobDescription: string | null): string[] {
  const titleWords = toWords(jobTitle);
  const descriptionWords = toWords(jobDescription ?? "");
  return unique([...titleWords, ...descriptionWords]).slice(0, 80);
}

export function scoreResumeForJob(params: {
  resumeText: string;
  jobTitle: string;
  jobDescription: string | null;
  requiredSkills: string[] | null;
  preferredSkills: string[] | null;
}): number {
  const requiredSkills = (params.requiredSkills ?? []).map((s) => s.trim()).filter(Boolean);
  const preferredSkills = (params.preferredSkills ?? []).map((s) => s.trim()).filter(Boolean);
  const jobKeywords = getJobKeywords(params.jobTitle, params.jobDescription);
  const titleWords = toWords(params.jobTitle);

  const reqCoverage = requiredSkills.length > 0
    ? scoreKeywordCoverage(params.resumeText, requiredSkills)
    : 0;
  const prefCoverage = preferredSkills.length > 0
    ? scoreKeywordCoverage(params.resumeText, preferredSkills)
    : 0;
  const titleCoverage = titleWords.length > 0
    ? scoreKeywordCoverage(params.resumeText, titleWords)
    : 0;
  const keywordCoverage = jobKeywords.length > 0
    ? scoreKeywordCoverage(params.resumeText, jobKeywords)
    : 0;

  const components: Array<{ weight: number; value: number }> = [];

  if (requiredSkills.length > 0) {
    components.push({ weight: 55, value: reqCoverage });
  }
  if (preferredSkills.length > 0) {
    components.push({ weight: 15, value: prefCoverage });
  }
  if (titleWords.length > 0) {
    components.push({ weight: 20, value: titleCoverage });
  }
  if (jobKeywords.length > 0) {
    components.push({ weight: 10, value: keywordCoverage });
  }

  if (components.length === 0) {
    return 0;
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted = components.reduce((sum, c) => sum + c.weight * c.value, 0);
  return Math.max(0, Math.min(100, Math.round((weighted / totalWeight) * 100)));
}
