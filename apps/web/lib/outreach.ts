type ContactSuggestion = {
  role: string;
  full_name: string | null;
  email: string | null;
};

function normalizeDomain(companyWebsite?: string | null, companyName?: string | null) {
  if (companyWebsite) {
    try {
      const url = new URL(companyWebsite.startsWith("http") ? companyWebsite : `https://${companyWebsite}`);
      return url.hostname.replace(/^www\./, "");
    } catch {
      // fall through
    }
  }

  if (companyName) {
    const cleaned = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
    if (cleaned.length > 0) {
      return `${cleaned}.com`;
    }
  }

  return null;
}

export function buildContactSuggestions({
  companyName,
  companyWebsite,
}: {
  companyName?: string | null;
  companyWebsite?: string | null;
}) {
  const domain = normalizeDomain(companyWebsite, companyName);

  const suggestions: ContactSuggestion[] = [
    {
      role: "Hiring Manager",
      full_name: null,
      email: domain ? `hiring.manager@${domain}` : null,
    },
    {
      role: "Recruiter/TA",
      full_name: null,
      email: domain ? `recruiting@${domain}` : null,
    },
    {
      role: "Department Head",
      full_name: null,
      email: domain ? `department.head@${domain}` : null,
    },
    {
      role: "Team Lead/Manager",
      full_name: null,
      email: domain ? `team.lead@${domain}` : null,
    },
  ];

  return suggestions.slice(0, 2);
}

export function buildDraftEmail({
  jobTitle,
  companyName,
  jobSeekerName,
  contactRole,
}: {
  jobTitle: string;
  companyName?: string | null;
  jobSeekerName?: string | null;
  contactRole?: string | null;
}) {
  const safeCompany = companyName ?? "your team";
  const seeker = jobSeekerName ?? "a candidate";
  const role = contactRole ?? "hiring team";
  const subject = `Interest in ${jobTitle} at ${safeCompany}`;

  const body = [
    `Hi ${role},`,
    "",
    `I wanted to share ${seeker}'s interest in the ${jobTitle} role at ${safeCompany}.`,
    "They recently applied and are excited about the opportunity.",
    "",
    "If helpful, I can provide a quick summary of their background or coordinate next steps.",
    "",
    "Thanks,",
    "JobGenius AM",
  ].join("\n");

  return { subject, body };
}
