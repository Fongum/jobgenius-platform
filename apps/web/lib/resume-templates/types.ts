export interface StructuredResume {
  contact: {
    fullName: string;
    email: string;
    phone: string | null;
    location: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
  };
  summary: string;
  workExperience: {
    title: string;
    company: string;
    location: string | null;
    startDate: string;
    endDate: string;
    bullets: string[];
  }[];
  education: {
    degree: string;
    institution: string;
    field: string | null;
    graduationDate: string;
    gpa: string | null;
    honors: string | null;
  }[];
  skills: string[];
  certifications: {
    name: string;
    issuer: string | null;
    date: string | null;
  }[];
}

export type ResumeTemplateId = "classic" | "modern" | "executive" | "compact";

export const RESUME_TEMPLATES: {
  id: ResumeTemplateId;
  name: string;
  description: string;
}[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Centered name, horizontal rules, clean sections",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Left-aligned name, underlined headings, italic titles",
  },
  {
    id: "executive",
    name: "Executive",
    description: "Generous spacing, prominent summary, company-first",
  },
  {
    id: "compact",
    name: "Compact",
    description: "Dense layout, tight spacing, max content per page",
  },
];
