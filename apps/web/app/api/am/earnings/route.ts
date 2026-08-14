import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { payabilityNote, sumEarned } from "@/lib/am-incentives";

/**
 * GET /api/am/earnings[?account_manager_id=…]
 *
 * What the caller has earned: placement bonuses and interview milestones,
 * with the arithmetic behind each. An AM sees only their own; an admin may
 * look at anyone's.
 *
 * Deliberately not team-visible. What a colleague earns is not team
 * business, unlike the activity sheet.
 */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const requested = new URL(request.url).searchParams.get("account_manager_id");
  const isAdmin = isAdminRole(auth.user.role);
  const targetId = requested && isAdmin ? requested : auth.user.id;

  // Placement bonuses hang off employee records, which hang off the AM.
  const { data: employee } = await supabaseAdmin
    .from("employees")
    .select("id")
    .eq("account_manager_id", targetId)
    .maybeSingle();

  const [{ data: awards, error: awardsError }, { data: bonuses }] =
    await Promise.all([
      supabaseAdmin
        .from("am_incentive_awards")
        .select(
          "id, kind, amount, currency, status, job_seeker_id, note, created_at, paid_at"
        )
        .eq("account_manager_id", targetId)
        .order("created_at", { ascending: false })
        .limit(200),
      employee?.id
        ? supabaseAdmin
            .from("employee_bonus_records")
            .select(
              "id, bonus_amount, payment_status, payment_month, payable_from, difficulty_tier, difficulty_multiplier, commission_basis, bonus_rate, computation_note, accepted_offer_record_id, created_at"
            )
            .eq("employee_id", employee.id)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (awardsError) {
    console.error("[earnings:get]", awardsError);
    return NextResponse.json(
      { error: "Failed to load earnings." },
      { status: 500 }
    );
  }

  const awardRows = awards ?? [];
  const bonusRows = bonuses ?? [];

  // Client names for context — an earnings line that does not say who it
  // was for is impossible to check.
  const seekerIds = Array.from(
    new Set(
      awardRows
        .map((a) => a.job_seeker_id as string | null)
        .filter((id): id is string => Boolean(id))
    )
  );
  const { data: seekers } = seekerIds.length
    ? await supabaseAdmin
        .from("job_seekers")
        .select("id, full_name, email")
        .in("id", seekerIds)
    : { data: [] };

  const seekerName = new Map(
    (seekers ?? []).map((s) => {
      const name = typeof s.full_name === "string" ? s.full_name.trim() : "";
      const email = typeof s.email === "string" ? s.email.trim() : "";
      return [s.id as string, name || email || "Unknown client"];
    })
  );

  const now = new Date();

  const placements = bonusRows.map((row) => ({
    id: row.id as string,
    amount: Number(row.bonus_amount) || 0,
    status: (row.payment_status as string) ?? "pending",
    payment_month: (row.payment_month as string | null) ?? null,
    payable_from: (row.payable_from as string | null) ?? null,
    payability: payabilityNote(row.payable_from as string | null, now),
    difficulty_tier: (row.difficulty_tier as string | null) ?? null,
    difficulty_multiplier: row.difficulty_multiplier
      ? Number(row.difficulty_multiplier)
      : null,
    commission_basis: row.commission_basis ? Number(row.commission_basis) : null,
    bonus_rate: row.bonus_rate ? Number(row.bonus_rate) : null,
    note: (row.computation_note as string | null) ?? null,
    created_at: row.created_at as string,
  }));

  const milestones = awardRows.map((row) => ({
    id: row.id as string,
    kind: row.kind as string,
    amount: Number(row.amount) || 0,
    currency: (row.currency as string) ?? "XAF",
    status: (row.status as string) ?? "pending",
    client: row.job_seeker_id
      ? seekerName.get(row.job_seeker_id as string) ?? "Unknown client"
      : null,
    note: (row.note as string | null) ?? null,
    created_at: row.created_at as string,
    paid_at: (row.paid_at as string | null) ?? null,
  }));

  return NextResponse.json({
    account_manager_id: targetId,
    is_own: targetId === auth.user.id,
    placements,
    milestones,
    // Placement statuses use the payroll vocabulary ('paid'/'pending'),
    // which lines up with the award statuses closely enough to total.
    totals: sumEarned([
      ...placements.map((p) => ({ amount: p.amount, status: p.status })),
      ...milestones.map((m) => ({ amount: m.amount, status: m.status })),
    ]),
  });
}
