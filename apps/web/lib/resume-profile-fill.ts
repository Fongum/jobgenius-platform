// ============================================================
// Turn a parsed résumé into profile updates — fill-only, never overwrite.
//
// Production (2026-09-19): 18 of 25 seekers had résumé text on file but 15
// had no skills, 16 no work history and 15 no education. Those fields drive
// job matching, résumé tailoring, the interview prep pack and the live voice
// interview, and they are worth 28 of 100 profile-completion points. The
// parsed profile was returned to the browser and only saved if the client
// applied and re-saved it; signup prefill saved work history and education
// but dropped skills.
//
// Rules:
//   - a field is filled only when the seeker's current value is empty, so a
//     seeker's own edits (or an AM's) are never clobbered;
//   - identity fields (name, email) are never touched;
//   - AI output is untrusted: values are type-checked, trimmed, de-duplicated
//     and capped before they reach the database.
//
// Pure functions: no Supabase/OpenAI imports.
// ============================================================

export type ProfileFill = {
  /** Column → value to write. Only ever contains currently-empty columns. */
  updates: Record<string, unknown>;
  /** Names of the columns filled, for logging/response. */
  filled: string[];
};

const MAX_SKILLS = 50;
const MAX_SKILL_LENGTH = 60;
const MAX_WORK_ENTRIES = 15;
const MAX_EDUCATION_ENTRIES = 8;
const MAX_TEXT = 300;
const MAX_DESCRIPTION = 1500;

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function cleanSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const skill = text(entry, MAX_SKILL_LENGTH);
    const key = skill.toLowerCase();
    if (skill.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

function cleanWorkHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const title = text(r.title);
    const company = text(r.company);
    if (!title && !company) continue; // an entry with neither is noise
    out.push({
      title,
      company,
      start_date: text(r.start_date, 40),
      end_date: text(r.end_date, 40),
      current: r.current === true,
      description: text(r.description, MAX_DESCRIPTION),
    });
    if (out.length >= MAX_WORK_ENTRIES) break;
  }
  return out;
}

function cleanEducation(value: unknown) {
  if (!Array.isArray(value)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const degree = text(r.degree);
    const school = text(r.school);
    if (!degree && !school) continue;
    out.push({
      degree,
      school,
      field: text(r.field),
      graduation_year: text(typeof r.graduation_year === "number" ? String(r.graduation_year) : r.graduation_year, 10),
    });
    if (out.length >= MAX_EDUCATION_ENTRIES) break;
  }
  return out;
}

function cleanLinkedIn(value: unknown): string {
  const url = text(value, 200);
  return /linkedin\.com\/in\//i.test(url) ? url : "";
}

/**
 * @param seeker  The job_seekers row (or any object with the same column names).
 * @param parsed  A parsed résumé from the AI parser or the regex fallback; may be null.
 */
export function buildProfileFill(
  seeker: Record<string, unknown>,
  parsed: Record<string, unknown> | null | undefined
): ProfileFill {
  const updates: Record<string, unknown> = {};
  if (!parsed || typeof parsed !== "object") return { updates, filled: [] };

  const candidates: Array<[string, unknown]> = [
    ["phone", text(parsed.phone, 40)],
    ["linkedin_url", cleanLinkedIn(parsed.linkedin_url)],
    ["location", text(parsed.location, 120)],
    ["skills", cleanSkills(parsed.skills)],
    ["work_history", cleanWorkHistory(parsed.work_history)],
    ["education", cleanEducation(parsed.education)],
  ];

  for (const [column, value] of candidates) {
    if (isEmpty(value)) continue; // nothing usable parsed
    if (!isEmpty(seeker[column])) continue; // seeker already has a value: never overwrite
    updates[column] = value;
  }

  return { updates, filled: Object.keys(updates) };
}
