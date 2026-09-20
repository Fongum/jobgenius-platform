import { requireOpsAuth } from "@/lib/ops-auth";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { supabaseServer } from "@/lib/supabase/server";
import { parseResumeText, parseResumeWithAI } from "@/lib/resume-parser";
import { buildProfileFill } from "@/lib/resume-profile-fill";
import { calculateProfileCompletion } from "@/lib/portal/profile-completion";

// ============================================================
// POST /api/ops/seekers/backfill-profile-from-resume
//
// Fills skills / work history / education (and phone, LinkedIn, location) for
// seekers whose résumé text is on file but whose structured profile is empty.
// Fill-only: a value a seeker or AM already set is never overwritten.
//
// Work history and education can only come from the AI parser (the regex
// fallback extracts contact info and a "Skills:" line at most), so run this
// after OpenAI billing is restored. The response reports how many seekers were
// parsed by AI vs the regex fallback so an operator can tell.
//
// Safe by default: without `{"confirm": true}` it only reports what it would do
// and makes no AI calls.
// Body: { confirm?: boolean, limit?: number (1-50, default 25) }
// ============================================================

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MIN_RESUME_CHARS = 200;
const SCAN_LIMIT = 500;

const SELECT_COLUMNS =
  "id, full_name, phone, location, linkedin_url, seniority, work_type, salary_min, salary_max, target_titles, skills, work_history, education, resume_text, years_experience, preferred_industries";

const isEmpty = (value: unknown) =>
  value == null || value === "" || (Array.isArray(value) && value.length === 0);

export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const auth = requireOpsAuth(request.headers);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  let body: { confirm?: unknown; limit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine: it means a dry run with defaults.
  }

  const confirm = body.confirm === true;
  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const { data: rows, error: loadError } = await supabaseServer
    .from("job_seekers")
    .select(SELECT_COLUMNS)
    .not("resume_text", "is", null)
    .order("created_at", { ascending: true })
    .limit(SCAN_LIMIT);

  if (loadError) {
    console.error("[seekers:backfill-profile] failed to load seekers:", loadError);
    return Response.json({ success: false, error: "Failed to load seekers." }, { status: 500 });
  }

  const candidates = (rows ?? []).filter((row) => {
    const resume = typeof row.resume_text === "string" ? row.resume_text.trim() : "";
    if (resume.length < MIN_RESUME_CHARS) return false;
    return isEmpty(row.skills) || isEmpty(row.work_history) || isEmpty(row.education);
  });

  if (!confirm) {
    return Response.json({
      success: true,
      dry_run: true,
      candidates: candidates.length,
      would_process: Math.min(candidates.length, limit),
      missing: {
        skills: candidates.filter((r) => isEmpty(r.skills)).length,
        work_history: candidates.filter((r) => isEmpty(r.work_history)).length,
        education: candidates.filter((r) => isEmpty(r.education)).length,
      },
      note: 'Nothing was changed and no AI calls were made. Send {"confirm": true} to backfill.',
    });
  }

  const batch = candidates.slice(0, limit);
  const filledByField: Record<string, number> = {};
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let parsedByAi = 0;
  let parsedByRegex = 0;

  // Sequential on purpose: each seeker is one AI call, and there is no rush.
  for (const row of batch) {
    try {
      const resume = (row.resume_text as string).trim();
      let parsed: Record<string, unknown> | null = await parseResumeWithAI(resume);
      if (parsed) {
        parsedByAi++;
      } else {
        parsed = parseResumeText(resume);
        parsedByRegex++;
      }

      const fill = buildProfileFill(row as Record<string, unknown>, parsed);
      if (fill.filled.length === 0) {
        unchanged++;
        continue;
      }

      const completion = calculateProfileCompletion({ ...row, ...fill.updates });
      const { error: updateError } = await supabaseServer
        .from("job_seekers")
        .update({ ...fill.updates, profile_completion: completion.percentage })
        .eq("id", row.id);

      if (updateError) {
        console.error("[seekers:backfill-profile] update failed:", { id: row.id, error: updateError });
        failed++;
        continue;
      }

      updated++;
      for (const field of fill.filled) filledByField[field] = (filledByField[field] ?? 0) + 1;
    } catch (err) {
      console.error("[seekers:backfill-profile] unexpected failure:", { id: row.id, err });
      failed++;
    }
  }

  return Response.json({
    success: true,
    dry_run: false,
    candidates: candidates.length,
    processed: batch.length,
    updated,
    unchanged,
    failed,
    parsed_by: { ai: parsedByAi, regex_fallback: parsedByRegex },
    filled_fields: filledByField,
    has_more: candidates.length > batch.length,
    hint:
      parsedByAi === 0 && batch.length > 0
        ? "No résumé was parsed by AI (the AI parser is unavailable — check OpenAI billing). Only contact info and a Skills line can be filled by the fallback; re-run once AI is available."
        : undefined,
  });
}
