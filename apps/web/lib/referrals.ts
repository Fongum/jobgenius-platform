import { supabaseAdmin } from "@/lib/auth";

export type ReferralStatus = "signed_up" | "placed" | "rewarded";

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  status: ReferralStatus;
  reward_amount: number | null;
  reward_paid_at: string | null;
  reward_notes: string | null;
  signed_up_at: string;
  placed_at: string | null;
  created_at: string;
}

/**
 * Look up a job seeker by their referral code.
 * Returns the seeker id or null if not found.
 */
export async function getReferrerByCode(code: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("job_seekers")
    .select("id")
    .eq("referral_code", code.toUpperCase())
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Create a referral row linking referrer → referred seeker.
 * Uses ON CONFLICT DO NOTHING to prevent duplicate pairs.
 */
export async function createReferral(
  referrerId: string,
  referredId: string
): Promise<void> {
  const { error } = await supabaseAdmin.from("referrals").insert({
    referrer_id: referrerId,
    referred_id: referredId,
    status: "signed_up",
    signed_up_at: new Date().toISOString(),
  });

  // Ignore unique-constraint violations (duplicate pair)
  if (error && error.code !== "23505") {
    console.error("createReferral error:", error);
  }
}

/**
 * Mark a referral as placed when the referred seeker is hired.
 * Only transitions rows that are still in 'signed_up' status.
 */
export async function markReferralPlaced(referredId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("referrals")
    .update({
      status: "placed",
      placed_at: new Date().toISOString(),
    })
    .eq("referred_id", referredId)
    .eq("status", "signed_up");

  if (error) {
    console.error("markReferralPlaced error:", error);
  }
}
