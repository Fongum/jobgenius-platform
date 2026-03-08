import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import ReferralsClient from "./ReferralsClient";

export const metadata = { title: "Referrals | JobGenius" };

export default async function ReferralsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const seekerId = user.id;

  // Fetch the seeker's referral code
  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("referral_code")
    .eq("id", seekerId)
    .single();

  // Fetch referrals where this seeker is the referrer
  const { data: referrals } = await supabaseAdmin
    .from("referrals")
    .select("id, referred_id, status, reward_amount, reward_paid_at, signed_up_at, placed_at")
    .eq("referrer_id", seekerId)
    .order("signed_up_at", { ascending: false });

  // Get referred seeker names for initials
  const referredIds = (referrals ?? []).map((r) => r.referred_id).filter(Boolean) as string[];
  let nameMap: Record<string, string> = {};
  if (referredIds.length > 0) {
    const { data: referred } = await supabaseAdmin
      .from("job_seekers")
      .select("id, full_name")
      .in("id", referredIds);
    for (const s of referred ?? []) {
      const initial = (s.full_name as string | null)?.trim().charAt(0).toUpperCase() ?? "?";
      nameMap[s.id] = initial;
    }
  }

  const rows = (referrals ?? []).map((r) => ({
    id: r.id as string,
    referred_initial: r.referred_id ? (nameMap[r.referred_id] ?? "?") : "?",
    status: r.status as "signed_up" | "placed" | "rewarded",
    reward_amount: r.reward_amount as number | null,
    reward_paid_at: r.reward_paid_at as string | null,
    signed_up_at: r.signed_up_at as string,
    placed_at: r.placed_at as string | null,
  }));

  const stats = {
    total_referred: rows.length,
    signed_up: rows.filter((r) => r.status === "signed_up").length,
    placed: rows.filter((r) => r.status === "placed").length,
    rewarded: rows.filter((r) => r.status === "rewarded").length,
    total_rewards_earned: rows
      .filter((r) => r.status === "rewarded")
      .reduce((sum, r) => sum + (r.reward_amount ?? 0), 0),
    pending_rewards: rows
      .filter((r) => r.status === "placed")
      .reduce((sum, r) => sum + (r.reward_amount ?? 0), 0),
  };

  return (
    <ReferralsClient
      referralCode={seeker?.referral_code ?? ""}
      stats={stats}
      referrals={rows}
    />
  );
}
