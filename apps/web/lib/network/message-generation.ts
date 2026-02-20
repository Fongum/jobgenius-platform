import { getOpenAIClient, OPENAI_MODEL } from "@/lib/openai";

interface ContactInfo {
  full_name: string;
  contact_type: "recruiter" | "referral";
  company_name: string | null;
  job_title: string | null;
}

interface MatchInfo {
  match_reason: string;
}

interface SeekerInfo {
  full_name: string | null;
}

interface JobPostInfo {
  title: string | null;
  company: string | null;
  description_text: string | null;
}

/**
 * Generate a personalized outreach email for a network contact match.
 */
export async function generateNetworkOutreachEmail(
  contact: ContactInfo,
  match: MatchInfo,
  seeker: SeekerInfo,
  jobPost: JobPostInfo
): Promise<{ subject: string; body: string }> {
  const client = getOpenAIClient();

  const seekerName = seeker.full_name || "our candidate";
  const jobTitle = jobPost.title || "the open position";
  const company = jobPost.company || contact.company_name || "your company";

  const systemPrompt =
    contact.contact_type === "recruiter"
      ? `You are an account manager writing a professional email to a recruiter.
Your goal is to pitch a job seeker for an open role the recruiter may be hiring for.
Keep the tone warm, concise, and professional. Do not use overly salesy language.
Output JSON with "subject" and "body" (HTML with <p> tags).`
      : `You are an account manager writing a professional email to a referral contact.
Your goal is to ask for an internal referral at their company for a specific role.
Keep the tone warm, personal, and professional. Reference the specific job posting.
Output JSON with "subject" and "body" (HTML with <p> tags).`;

  const userPrompt =
    contact.contact_type === "recruiter"
      ? `Write an outreach email to ${contact.full_name}${contact.job_title ? ` (${contact.job_title})` : ""}${contact.company_name ? ` at ${contact.company_name}` : ""}.

Pitch ${seekerName} for the role: "${jobTitle}" at ${company}.
Match reason: ${match.match_reason}

Job description excerpt (first 500 chars):
${(jobPost.description_text || "").slice(0, 500)}`
      : `Write an outreach email to ${contact.full_name}${contact.job_title ? ` (${contact.job_title})` : ""} at ${contact.company_name || company}.

Ask for an internal referral for ${seekerName} for the role: "${jobTitle}" at ${company}.
Match reason: ${match.match_reason}

Job description excerpt (first 500 chars):
${(jobPost.description_text || "").slice(0, 500)}`;

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    return {
      subject: parsed.subject || `Regarding ${jobTitle} at ${company}`,
      body: parsed.body || `<p>Hi ${contact.full_name},</p><p>I'd love to connect about the ${jobTitle} role at ${company}.</p>`,
    };
  } catch {
    return {
      subject: `Regarding ${jobTitle} at ${company}`,
      body: `<p>Hi ${contact.full_name},</p><p>I'd love to connect about the ${jobTitle} role at ${company}.</p>`,
    };
  }
}

/**
 * Generate a short text/WhatsApp message for a network contact match.
 */
export async function generateNetworkOutreachText(
  contact: ContactInfo,
  match: MatchInfo,
  seeker: SeekerInfo,
  jobPost: JobPostInfo
): Promise<string> {
  const client = getOpenAIClient();

  const seekerName = seeker.full_name || "a strong candidate";
  const jobTitle = jobPost.title || "an open position";
  const company = jobPost.company || contact.company_name || "your company";

  const prompt =
    contact.contact_type === "recruiter"
      ? `Write a short, friendly text message (under 300 chars) to recruiter ${contact.full_name} pitching ${seekerName} for the "${jobTitle}" role at ${company}. Keep it casual but professional. No subject line needed.`
      : `Write a short, friendly text message (under 300 chars) to ${contact.full_name} at ${company} asking for an internal referral for ${seekerName} for the "${jobTitle}" role. Keep it casual but professional. No subject line needed.`;

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 200,
  });

  return (
    response.choices[0]?.message?.content?.trim() ||
    `Hi ${contact.full_name}, I have a great candidate for the ${jobTitle} role at ${company}. Would you be open to connecting?`
  );
}
