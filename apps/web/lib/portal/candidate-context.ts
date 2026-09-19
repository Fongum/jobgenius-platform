// ============================================================
// Pure résumé → prompt helpers, shared by the live voice interview
// (lib/portal/interview-context.ts) and the prep-pack generator
// (lib/interview-prep-ai.ts, run from the background job).
//
// Deliberately free of Supabase/auth imports so any server route can use
// it without pulling in a client that reads env at module load.
// ============================================================

export type InterviewCandidateContext = {
  fullName: string | null;
  skills: string[];
  workHistory: string[];
  education: string[];
};

/** The job_seekers columns the résumé context is built from. */
export type SeekerResumeRow = {
  full_name?: unknown;
  skills?: unknown;
  work_history?: unknown;
  education?: unknown;
};

export function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (out.length >= limit) break;
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) out.push(trimmed);
      continue;
    }
    if (entry && typeof entry === "object") {
      // work_history / education are jsonb arrays of objects — flatten the
      // human-readable bits into a single line.
      const record = entry as Record<string, unknown>;
      const parts = [
        record.title ?? record.role ?? record.degree ?? record.position,
        record.company ?? record.school ?? record.institution ?? record.employer,
        record.duration ?? record.dates ?? record.year ?? record.years,
      ]
        .filter((p) => typeof p === "string" && p.trim())
        .map((p) => (p as string).trim());
      if (parts.length > 0) out.push(parts.join(" — "));
    }
  }
  return out;
}

export function candidateFromSeekerRow(
  row: SeekerResumeRow | null | undefined
): InterviewCandidateContext {
  return {
    fullName: typeof row?.full_name === "string" ? row.full_name : null,
    skills: asStringArray(row?.skills, 25),
    workHistory: asStringArray(row?.work_history, 8),
    education: asStringArray(row?.education, 5),
  };
}

export function candidateHasResume(candidate: InterviewCandidateContext): boolean {
  return (
    candidate.skills.length > 0 ||
    candidate.workHistory.length > 0 ||
    candidate.education.length > 0
  );
}

/** Compact, prompt-ready candidate résumé block (empty string if none). */
export function buildCandidateContextBlock(candidate: InterviewCandidateContext): string {
  const lines: string[] = [];
  if (candidate.skills.length > 0) {
    lines.push(`Candidate skills: ${candidate.skills.join(", ")}`);
  }
  if (candidate.workHistory.length > 0) {
    lines.push(`Candidate work history:\n- ${candidate.workHistory.join("\n- ")}`);
  }
  if (candidate.education.length > 0) {
    lines.push(`Candidate education:\n- ${candidate.education.join("\n- ")}`);
  }
  return lines.join("\n");
}
