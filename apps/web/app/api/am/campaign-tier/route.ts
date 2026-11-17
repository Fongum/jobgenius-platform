import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { requireAMAccessToSeeker } from "@/lib/am-access";
import {
  PRICING_PLANS,
  RECURRING_PLAN,
  CAMPAIGN_TIERS,
  currentSetupFeeUsd,
  isCampaignTier,
} from "@/app/components/homepage/marketingContent";

/**
 * GET    /api/am/campaign-tier?job_seeker_id=…  → Recurring monthly payments recorded for the client.
 * POST   /api/am/campaign-tier    → assign the client's plan (Essentials/Premium/Recurring)
 *                                    and snapshot its setup fee (or monthly fee) onto the seeker.
 * PATCH  /api/am/campaign-tier    → Essentials/Premium: mark the setup fee as paid.
 *                                    Recurring: record a month as paid ({ period_start?: "YYYY-MM-DD" }).
 * DELETE /api/am/campaign-tier    → Recurring: record that the client stopped the subscription.
 * Body (POST/PATCH/DELETE): { job_seeker_id: string }
 * Body (POST only): { tier: "essentials" | "premium" | "recurring" }
 */

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export async function GET(request: Request) {
  const jobSeekerId = new URL(request.url).searchParams.get("job_seeker_id");
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }
  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { data, error } = await supabaseAdmin
    .from("subscription_payments")
    .select("id, period_start, amount_usd, paid_at")
    .eq("job_seeker_id", jobSeekerId)
    .order("period_start", { ascending: false })
    .limit(24);
  if (error) {
    console.error("Subscription payments lookup failed:", error);
    return NextResponse.json({ error: "Failed to load monthly payments." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, payments: data ?? [] });
}

export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }
  if (!isCampaignTier(body.tier)) {
    return NextResponse.json(
      { error: "tier must be one of: " + CAMPAIGN_TIERS.join(", ") },
      { status: 400 }
    );
  }
  const tier = body.tier;

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const selectedAt = new Date().toISOString();
  // Lock in the price at selection time; the agreement reuses the stored fee.
  let setupFeeUsd: number | null = null;
  let monthlyFeeUsd: number | null = null;
  if (tier === "recurring") {
    monthlyFeeUsd = RECURRING_PLAN.monthlyFeeUsd;
  } else {
    const plan = PRICING_PLANS.find((p) => p.name.toLowerCase() === tier)!;
    setupFeeUsd = currentSetupFeeUsd(plan);
  }

  const { error } = await supabaseAdmin
    .from("job_seekers")
    .update({
      campaign_tier: tier,
      campaign_tier_selected_at: selectedAt,
      campaign_tier_selected_by: access.amId,
      setup_fee_usd: setupFeeUsd,
      monthly_fee_usd: monthlyFeeUsd,
      // Changing plans resets any prior paid mark / stop — re-confirm for the new plan.
      setup_fee_paid_at: null,
      setup_fee_marked_paid_by: null,
      subscription_cancelled_at: null,
      subscription_cancelled_by: null,
    })
    .eq("id", jobSeekerId);

  if (error) {
    console.error("Campaign tier update failed:", error);
    return NextResponse.json({ error: "Failed to set the campaign tier." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    campaign_tier: tier,
    setup_fee_usd: setupFeeUsd,
    monthly_fee_usd: monthlyFeeUsd,
    campaign_tier_selected_at: selectedAt,
  });
}

export async function PATCH(request: Request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("campaign_tier, monthly_fee_usd, subscription_cancelled_at")
    .eq("id", jobSeekerId)
    .maybeSingle();

  if (!seeker?.campaign_tier) {
    return NextResponse.json(
      { error: "Set a campaign tier before marking a payment." },
      { status: 400 }
    );
  }

  if (seeker.campaign_tier === "recurring") {
    const periodStart =
      typeof body.period_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.period_start)
        ? body.period_start
        : todayIso();
    const stoppedOn = seeker.subscription_cancelled_at
      ? String(seeker.subscription_cancelled_at).split("T")[0]
      : null;
    if (stoppedOn && periodStart > stoppedOn) {
      return NextResponse.json(
        { error: "This subscription was stopped. Re-select the Recurring plan to restart it." },
        { status: 400 }
      );
    }
    const amount = Number(seeker.monthly_fee_usd) || RECURRING_PLAN.monthlyFeeUsd;
    const { data: payment, error } = await supabaseAdmin
      .from("subscription_payments")
      .insert({
        job_seeker_id: jobSeekerId,
        period_start: periodStart,
        amount_usd: amount,
        marked_by: access.amId,
      })
      .select("id, period_start, amount_usd, paid_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A payment for the period starting ${periodStart} is already recorded.` },
          { status: 409 }
        );
      }
      console.error("Subscription payment insert failed:", error);
      return NextResponse.json({ error: "Failed to record the monthly payment." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, payment });
  }

  const paidAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("job_seekers")
    .update({
      setup_fee_paid_at: paidAt,
      setup_fee_marked_paid_by: access.amId,
    })
    .eq("id", jobSeekerId);

  if (error) {
    console.error("Setup fee paid-mark failed:", error);
    return NextResponse.json({ error: "Failed to mark the setup fee as paid." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, setup_fee_paid_at: paidAt });
}

export async function DELETE(request: Request) {
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const jobSeekerId = typeof body.job_seeker_id === "string" ? body.job_seeker_id : null;
  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  const access = await requireAMAccessToSeeker(request.headers, jobSeekerId);
  if (!access.ok) return access.response;

  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("campaign_tier, subscription_cancelled_at")
    .eq("id", jobSeekerId)
    .maybeSingle();

  if (seeker?.campaign_tier !== "recurring") {
    return NextResponse.json({ error: "Only a Recurring subscription can be stopped." }, { status: 400 });
  }
  if (seeker.subscription_cancelled_at) {
    return NextResponse.json({ ok: true, subscription_cancelled_at: seeker.subscription_cancelled_at });
  }

  const cancelledAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("job_seekers")
    .update({ subscription_cancelled_at: cancelledAt, subscription_cancelled_by: access.amId })
    .eq("id", jobSeekerId);

  if (error) {
    console.error("Subscription stop failed:", error);
    return NextResponse.json({ error: "Failed to stop the subscription." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, subscription_cancelled_at: cancelledAt });
}
