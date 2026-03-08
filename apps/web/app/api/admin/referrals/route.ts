import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

// GET /api/admin/referrals
// Returns all referrals with referrer/referred names and aggregate stats
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: referrals } = await supabaseAdmin
    .from("referrals")
    .select(`
      id,
      referrer_id,
      referred_id,
      status,
      reward_amount,
      reward_paid_at,
      reward_notes,
      signed_up_at,
      placed_at,
      created_at
    `)
    .order("created_at", { ascending: false });

  // Collect all seeker IDs for name lookup
  const allIds = new Set<string>();
  for (const r of referrals ?? []) {
    if (r.referrer_id) allIds.add(r.referrer_id);
    if (r.referred_id) allIds.add(r.referred_id);
  }

  let nameMap: Record<string, string> = {};
  if (allIds.size > 0) {
    const { data: seekers } = await supabaseAdmin
      .from("job_seekers")
      .select("id, full_name")
      .in("id", Array.from(allIds));
    for (const s of seekers ?? []) {
      nameMap[s.id] = (s.full_name as string | null) ?? "Unknown";
    }
  }

  const rows = (referrals ?? []).map((r) => ({
    id: r.id,
    referrer_id: r.referrer_id,
    referrer_name: nameMap[r.referrer_id] ?? "Unknown",
    referred_id: r.referred_id,
    referred_name: r.referred_id ? (nameMap[r.referred_id] ?? "Unknown") : null,
    status: r.status,
    reward_amount: r.reward_amount,
    reward_paid_at: r.reward_paid_at,
    reward_notes: r.reward_notes,
    signed_up_at: r.signed_up_at,
    placed_at: r.placed_at,
    created_at: r.created_at,
  }));

  // Aggregate stats
  const total = rows.length;
  const signed_up = rows.filter((r) => r.status === "signed_up").length;
  const placed = rows.filter((r) => r.status === "placed").length;
  const rewarded = rows.filter((r) => r.status === "rewarded").length;
  const total_paid = rows
    .filter((r) => r.status === "rewarded" && r.reward_amount != null)
    .reduce((sum, r) => sum + (r.reward_amount ?? 0), 0);
  const pending_payout = rows
    .filter((r) => r.status === "placed" && r.reward_amount != null)
    .reduce((sum, r) => sum + (r.reward_amount ?? 0), 0);

  return NextResponse.json({
    stats: { total, signed_up, placed, rewarded, total_paid, pending_payout },
    referrals: rows,
  });
}
