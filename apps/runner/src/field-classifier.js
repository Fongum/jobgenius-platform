/**
 * LLM-powered field classifier for the cloud runner.
 *
 * When the rules-based field mapper returns no match, this module
 * sends the field label + type to a lightweight LLM call to determine
 * the best answer from profile data or screening answers.
 *
 * Set FIELD_CLASSIFIER_ENABLED=true and OPENAI_API_KEY or ANTHROPIC_API_KEY.
 */

import { logLine } from "./logger.js";

const ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.FIELD_CLASSIFIER_ENABLED ?? "false").toLowerCase()
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const CLASSIFIER_TIMEOUT_MS = Number(process.env.FIELD_CLASSIFIER_TIMEOUT_MS ?? 15000);

/**
 * Classify a field and return a suggested value.
 * @param {object} field - { label, type, options }
 * @param {object} profile - job seeker profile data
 * @param {object[]} screeningAnswers - pre-configured screening answers
 * @param {object} job - job details (title, company)
 * @returns {Promise<string|null>} suggested value or null
 */
export async function classifyField(field, profile, screeningAnswers, job) {
  if (!ENABLED) return null;

  // First try screening answers (fast, no LLM needed)
  const screeningMatch = matchScreeningAnswer(field, screeningAnswers ?? []);
  if (screeningMatch) return screeningMatch;

  // Then try LLM classification
  return callLlmClassifier(field, profile, job);
}

/**
 * Classify multiple missing fields at once (batch mode).
 */
export async function classifyFields(fields, profile, screeningAnswers, job) {
  if (!ENABLED || !fields?.length) return {};

  const results = {};

  // First pass: screening answers (no LLM needed)
  const remaining = [];
  for (const field of fields) {
    const match = matchScreeningAnswer(field, screeningAnswers ?? []);
    if (match) {
      results[field.label] = match;
    } else {
      remaining.push(field);
    }
  }

  // Second pass: batch LLM call for remaining
  if (remaining.length > 0) {
    const llmResults = await callLlmClassifierBatch(remaining, profile, job);
    Object.assign(results, llmResults);
  }

  return results;
}

// ─── Screening answer matching ───

const QUESTION_KEY_PATTERNS = [
  { key: "work_authorization", patterns: ["authorized", "legally work", "eligible to work", "work authorization", "right to work"] },
  { key: "sponsorship", patterns: ["sponsor", "sponsorship", "visa sponsor"] },
  { key: "salary_expectations", patterns: ["salary", "compensation", "desired pay", "pay expectation", "expected salary"] },
  { key: "years_experience", patterns: ["years of experience", "years experience", "how many years"] },
  { key: "willing_to_relocate", patterns: ["relocate", "relocation", "willing to move"] },
  { key: "start_date", patterns: ["start date", "when can you start", "earliest start", "available to start"] },
  { key: "notice_period", patterns: ["notice period", "notice required", "two weeks"] },
  { key: "education_level", patterns: ["highest degree", "education level", "highest level of education", "degree"] },
  { key: "cover_letter", patterns: ["cover letter", "letter of interest", "introduction letter"] },
  { key: "gender", patterns: ["gender", "sex"] },
  { key: "race_ethnicity", patterns: ["race", "ethnicity", "ethnic background"] },
  { key: "veteran_status", patterns: ["veteran", "military service", "armed forces"] },
  { key: "disability_status", patterns: ["disability", "disabled"] },
  { key: "languages", patterns: ["language", "fluent", "proficient in"] },
  { key: "remote_preference", patterns: ["remote", "hybrid", "on-site", "work arrangement", "work location preference"] },
  { key: "how_did_you_hear", patterns: ["how did you hear", "where did you find", "referred by", "how did you find"] },
];

function matchScreeningAnswer(field, screeningAnswers) {
  const label = (field.label ?? "").toLowerCase();
  if (!label) return null;

  // Direct key match
  for (const answer of screeningAnswers) {
    if (!answer?.question_key || !answer?.answer_value) continue;
    for (const mapping of QUESTION_KEY_PATTERNS) {
      if (answer.question_key !== mapping.key) continue;
      if (mapping.patterns.some((p) => label.includes(p))) {
        // For select fields, try to match answer to options
        if (field.options?.length > 0) {
          return findBestOptionMatch(field.options, answer.answer_value);
        }
        return answer.answer_value;
      }
    }
  }

  // EEO / demographic fields - default to "Prefer not to answer"
  const eeoKeywords = ["gender", "race", "ethnicity", "veteran", "disability", "demographic"];
  if (eeoKeywords.some((kw) => label.includes(kw))) {
    if (field.options?.length > 0) {
      return findBestOptionMatch(field.options, "prefer not") ??
        findBestOptionMatch(field.options, "decline") ??
        findBestOptionMatch(field.options, "choose not");
    }
    return "Prefer not to answer";
  }

  return null;
}

function findBestOptionMatch(options, target) {
  if (!options?.length || !target) return null;
  const normalized = target.toLowerCase();
  const exact = options.find((o) => (o ?? "").toLowerCase() === normalized);
  if (exact) return exact;
  const partial = options.find((o) => (o ?? "").toLowerCase().includes(normalized));
  if (partial) return partial;
  const reverse = options.find((o) => normalized.includes((o ?? "").toLowerCase()));
  return reverse ?? null;
}

// ─── LLM classification ───

async function callLlmClassifier(field, profile, job) {
  const prompt = buildPrompt([field], profile, job);
  const response = await callLlm(prompt);
  if (!response) return null;

  try {
    const parsed = JSON.parse(response);
    return parsed[field.label] ?? null;
  } catch {
    return response.trim() || null;
  }
}

async function callLlmClassifierBatch(fields, profile, job) {
  const prompt = buildPrompt(fields, profile, job);
  const response = await callLlm(prompt);
  if (!response) return {};

  try {
    return JSON.parse(response);
  } catch {
    return {};
  }
}

function buildPrompt(fields, profile, job) {
  const profileSummary = JSON.stringify({
    name: profile?.full_name ?? profile?.name ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    location: profile?.location ?? "",
    linkedin: profile?.linkedin_url ?? "",
    portfolio: profile?.portfolio_url ?? "",
    work_history: (profile?.work_history ?? []).slice(0, 3).map((w) => ({
      title: w?.title ?? "",
      company: w?.company ?? "",
    })),
    education: profile?.education ?? "",
    skills: (profile?.skills ?? []).slice(0, 10),
  });

  const jobSummary = job ? `Job: ${job.title ?? ""} at ${job.company ?? ""}` : "";

  const fieldDescriptions = fields
    .map((f) => {
      let desc = `- "${f.label}" (type: ${f.type ?? "text"})`;
      if (f.options?.length > 0) desc += ` options: [${f.options.join(", ")}]`;
      return desc;
    })
    .join("\n");

  return `You are filling out a job application form. Given the applicant profile and the following unfilled required fields, provide the best answer for each field.

Profile: ${profileSummary}
${jobSummary}

Fields to fill:
${fieldDescriptions}

Rules:
- For EEO/demographic questions (gender, race, veteran, disability), always answer "Prefer not to answer" or select the decline option.
- For work authorization, answer "Yes" (assume authorized).
- For sponsorship, answer "No" (does not require).
- For salary, give a reasonable range based on the job title, or "Negotiable".
- For years of experience, estimate from work history.
- For "How did you hear about us", answer "Job board".
- For select fields, choose the exact option text from the provided options.
- Keep answers concise and professional.

Return a JSON object mapping field labels to answers. Only include fields you can answer.`;
}

async function callLlm(prompt) {
  try {
    if (ANTHROPIC_API_KEY) {
      return await callAnthropic(prompt);
    }
    if (OPENAI_API_KEY) {
      return await callOpenAI(prompt);
    }
    return null;
  } catch (error) {
    logLine({
      level: "WARN",
      step: "FIELD_CLASSIFIER",
      msg: `LLM call failed: ${error?.message ?? "unknown"}`,
    });
    return null;
  }
}

async function callAnthropic(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    return data?.content?.[0]?.text ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } finally {
    clearTimeout(timeout);
  }
}
