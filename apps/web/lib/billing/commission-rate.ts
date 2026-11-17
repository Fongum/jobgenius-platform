import { supabaseAdmin } from "@/lib/auth";
import { successFeeRateForTier } from "@/app/components/homepage/marketingContent";

/**
 * The success-fee rate that applies to a client's offers, in order of authority:
 *   1. the most recently signed Client Collaboration Agreement,
 *   2. the most recent portal billing contract,
 *   3. the client's current campaign tier (3.5% Recurring, otherwise 5%).
 */
export async function resolveCommissionRate(jobSeekerId: string): Promise<number> {
  const { data: agreement } = await supabaseAdmin
    .from("client_agreements")
    .select("commission_rate")
    .eq("job_seeker_id", jobSeekerId)
    .order("agreed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (Number(agreement?.commission_rate) > 0) return Number(agreement!.commission_rate);

  const { data: contract } = await supabaseAdmin
    .from("job_seeker_contracts")
    .select("commission_rate")
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (Number(contract?.commission_rate) > 0) return Number(contract!.commission_rate);

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("campaign_tier")
    .eq("id", jobSeekerId)
    .maybeSingle();
  return successFeeRateForTier(seeker?.campaign_tier);
}
