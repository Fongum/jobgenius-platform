import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    planType?: string;
    registrationFee?: number;
    contractHTML?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { planType, registrationFee, contractHTML } = body;

  if (
    typeof planType !== "string" ||
    !["essentials", "premium"].includes(planType)
  ) {
    return NextResponse.json({ error: "Invalid plan type." }, { status: 400 });
  }

  if (typeof registrationFee !== "number" || registrationFee <= 0) {
    return NextResponse.json({ error: "Invalid registration fee." }, { status: 400 });
  }

  // Get client IP
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

  const agreedAt = new Date().toISOString();

  // Find existing contract first. Using update/insert avoids dependency on unique constraints.
  const { data: existingContract, error: existingError } = await supabaseAdmin
    .from("job_seeker_contracts")
    .select("id")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("Billing contract lookup failed:", existingError);
    return NextResponse.json({ error: "Failed to save contract." }, { status: 500 });
  }

  const contractPayload = {
    job_seeker_id: auth.user.id,
    plan_type: planType,
    registration_fee: registrationFee,
    commission_rate: 0.05,
    contract_html: contractHTML ?? null,
    agreed_at: agreedAt,
    agreed_ip: ip,
  };

  const contractMutation = existingContract
    ? supabaseAdmin
        .from("job_seeker_contracts")
        .update(contractPayload)
        .eq("id", existingContract.id)
        .select()
        .single()
    : supabaseAdmin
        .from("job_seeker_contracts")
        .insert(contractPayload)
        .select()
        .single();

  const { data: contract, error: contractError } = await contractMutation;

  if (contractError || !contract) {
    console.error("Billing contract save failed:", contractError);
    return NextResponse.json({ error: "Failed to save contract." }, { status: 500 });
  }

  const { error: seekerError } = await supabaseAdmin
    .from("job_seekers")
    .update({ plan_type: planType, contract_id: contract.id })
    .eq("id", auth.user.id);

  if (seekerError?.code === "42703") {
    // Backward-compatible fallback if one of the new billing columns is not yet present.
    const { error: fallbackSeekerError } = await supabaseAdmin
      .from("job_seekers")
      .update({ plan_type: planType })
      .eq("id", auth.user.id);

    if (fallbackSeekerError) {
      console.error("Billing seeker update fallback failed:", fallbackSeekerError);
      return NextResponse.json(
        { error: "Failed to update seeker record." },
        { status: 500 }
      );
    }
  } else if (seekerError) {
    console.error("Billing seeker update failed:", seekerError);
    return NextResponse.json(
      { error: "Failed to update seeker record." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, contractId: contract.id, agreedAt });
}
