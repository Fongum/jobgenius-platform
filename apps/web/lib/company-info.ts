type CompanyInfoResult = {
  emails: string[];
  pagesVisited: string[];
};

const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "JobGeniusBot/1.0" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.text();
}

function extractEmails(text: string) {
  const matches = text.match(emailRegex) ?? [];
  const normalized = matches.map((email) => email.toLowerCase());
  return Array.from(new Set(normalized)).slice(0, 10);
}

export async function fetchCompanyInfo(companyWebsite: string) {
  const pagesVisited: string[] = [];
  const emails = new Set<string>();

  const normalized = companyWebsite.startsWith("http")
    ? companyWebsite
    : `https://${companyWebsite}`;

  const candidates = [
    normalized,
    `${normalized.replace(/\/$/, "")}/about`,
    `${normalized.replace(/\/$/, "")}/contact`,
    `${normalized.replace(/\/$/, "")}/careers`,
  ];

  for (const url of candidates) {
    try {
      const html = await fetchText(url);
      pagesVisited.push(url);
      extractEmails(html).forEach((email) => emails.add(email));
    } catch {
      // Ignore fetch errors for MVP.
    }
  }

  return {
    emails: Array.from(emails),
    pagesVisited,
  } as CompanyInfoResult;
}
