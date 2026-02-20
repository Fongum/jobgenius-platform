import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const { planType, registrationFee, contractHTML } = body;

  if (!["essentials", "premium"].includes(planType)) {
    return NextResponse.json({ error: "Invalid plan type." }, { status: 400 });
  }

  if (!registrationFee || registrationFee <= 0) {
    return NextResponse.json({ error: "Invalid registration fee." }, { status: 400 });
  }

  // Get client IP
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

  const agreedAt = new Date().toISOString();

  // Create or update contract
  const { data: contract, error: contractError } = await supabaseAdmin
    .from("job_seeker_contracts")
    .upsert(
      {
        job_seeker_id: auth.user.id,
        plan_type: planType,
        registration_fee: registrationFee,
        commission_rate: 0.05,
        contract_html: contractHTML ?? null,
        agreed_at: agreedAt,
        agreed_ip: ip,
      },
      { onConflict: "job_seeker_id" }
    )
    .select()
    .single();

  if (contractError || !contract) {
    return NextResponse.json({ error: "Failed to save contract." }, { status: 500 });
  }

  // Update job_seekers with plan_type and contract_id
  const { error: seekerError } = await supabaseAdmin
    .from("job_seekers")
    .update({ plan_type: planType, contract_id: contract.id })
    .eq("id", auth.user.id);

  if (seekerError) {
    return NextResponse.json({ error: "Failed to update seeker record." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, contractId: contract.id, agreedAt });
}
