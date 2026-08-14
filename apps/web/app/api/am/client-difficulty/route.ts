import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isPeopleManagerRole } from "@/lib/auth/roles";
import {
  assessDifficulty,
  isDifficultyTier,
  loadDifficultySignals,
} from "@/lib/client-difficulty";

const COLUMNS =
  "id, job_seeker_id, computed_tier, computed_score, signals, override_tier, override_reason, override_by, override_at, locked_at, created_at";

/** GET /api/am/client-difficulty — every assessment, newest first. */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("client_difficulty_assessments")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("[client-difficulty:get]", error);
    return NextResponse.json(
      { error: "Failed to load difficulty assessments." },
      { status: 500 }
    );
  }

  const assessments = rows ?? [];
  const seekerIds = assessments.map((a) => a.job_seeker_id as string);

  const { data: seekers } = seekerIds.length
    ? await supabaseAdmin
        .from("job_seekers")
        .select("id, full_name, email")
        .in("id", seekerIds)
    : { data: [] };

  const nameById = new Map(
    (seekers ?? []).map((s) => {
      const name = typeof s.full_name === "string" ? s.full_name.trim() : "";
      const email = typeof s.email === "string" ? s.email.trim() : "";
      return [s.id as string, name || email || "Unknown client"];
    })
  );

  return NextResponse.json({
    can_edit: isPeopleManagerRole(auth.user.role),
    assessments: assessments.map((row) => ({
      ...row,
      seeker_name: nameById.get(row.job_seeker_id as string) ?? "Unknown client",
    })),
  });
}

/**
 * POST /api/am/client-difficulty  { job_seeker_id }
 *
 * Assess a client from the signals the platform already holds. Refuses to
 * touch a locked assessment: the tier is frozen before any outcome is
 * known, and re-running it later is how a difficulty score turns into a
 * retrospective justification for a payout.
 */
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Only a people manager can assess difficulty." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId =
    typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json(
      { error: "job_seeker_id is required." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("client_difficulty_assessments")
    .select("id, locked_at")
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (existing?.locked_at) {
    return NextResponse.json(
      { error: "That assessment is locked and cannot be recomputed." },
      { status: 409 }
    );
  }

  const signals = await loadDifficultySignals(jobSeekerId);
  const assessment = assessDifficulty(signals);

  const payload = {
    job_seeker_id: jobSeekerId,
    computed_tier: assessment.tier,
    computed_score: assessment.score,
    signals: { ...signals, reasons: assessment.reasons },
  };

  const { data: saved, error } = existing
    ? await supabaseAdmin
        .from("client_difficulty_assessments")
        .update(payload)
        .eq("id", existing.id)
        .select(COLUMNS)
        .single()
    : await supabaseAdmin
        .from("client_difficulty_assessments")
        .insert(payload)
        .select(COLUMNS)
        .single();

  if (error) {
    console.error("[client-difficulty:post]", error);
    return NextResponse.json(
      { error: "Failed to save the assessment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ assessment: saved, reasons: assessment.reasons });
}

/**
 * PATCH /api/am/client-difficulty  { job_seeker_id, override_tier?, reason?, lock? }
 *
 * Override the computed tier, or lock it. An override without a reason is
 * an unexplained pay rise, so both are required together — and the
 * computed value is kept alongside, so a pattern of generous overrides is
 * visible rather than invisible.
 */
export async function PATCH(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isPeopleManagerRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Only a people manager can change a difficulty tier." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerId =
    typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json(
      { error: "job_seeker_id is required." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("client_difficulty_assessments")
    .select("id, locked_at")
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: "No assessment for that client yet." },
      { status: 404 }
    );
  }
  if (existing.locked_at) {
    return NextResponse.json(
      { error: "That assessment is locked and cannot be changed." },
      { status: 409 }
    );
  }

  const update: Record<string, unknown> = {};

  if (body.override_tier !== undefined) {
    if (body.override_tier === null) {
      update.override_tier = null;
      update.override_reason = null;
      update.override_by = null;
      update.override_at = null;
    } else {
      if (!isDifficultyTier(body.override_tier)) {
        return NextResponse.json(
          { error: "override_tier must be standard, hard or very_hard." },
          { status: 400 }
        );
      }
      const reason =
        typeof body.reason === "string" && body.reason.trim() !== ""
          ? body.reason.trim()
          : null;
      if (!reason) {
        return NextResponse.json(
          { error: "An override needs a reason." },
          { status: 400 }
        );
      }
      update.override_tier = body.override_tier;
      update.override_reason = reason;
      update.override_by = auth.user.id;
      update.override_at = new Date().toISOString();
    }
  }

  if (body.lock === true) {
    update.locked_at = new Date().toISOString();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { data: saved, error } = await supabaseAdmin
    .from("client_difficulty_assessments")
    .update(update)
    .eq("id", existing.id)
    // Re-assert unlocked, in case someone locked it between read and write.
    .is("locked_at", null)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[client-difficulty:patch]", error);
    return NextResponse.json(
      { error: "Failed to update the assessment." },
      { status: 500 }
    );
  }
  if (!saved) {
    return NextResponse.json(
      { error: "That assessment was locked while you were editing it." },
      { status: 409 }
    );
  }

  return NextResponse.json({ assessment: saved });
}
