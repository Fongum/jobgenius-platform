import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const { count, installments } = body as {
    count: number;
    installments: { amount: number; proposedDate: string }[];
  };

  if (!count || count < 1 || count > 3) {
    return NextResponse.json({ error: "Installment count must be 1, 2, or 3." }, { status: 400 });
  }

  if (!Array.isArray(installments) || installments.length !== count) {
    return NextResponse.json({ error: "Installments array length must match count." }, { status: 400 });
  }

  // Get contract to get fee
  const { data: contract } = await supabaseAdmin
    .from("job_seeker_contracts")
    .select("id, registration_fee")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!contract) {
    return NextResponse.json({ error: "No signed contract found. Please complete the contract step first." }, { status: 400 });
  }

  // Validate total matches fee
  const totalAmount = installments.reduce((sum, i) => sum + i.amount, 0);
  if (Math.abs(totalAmount - contract.registration_fee) > 0.01) {
    return NextResponse.json(
      { error: `Installment total ($${totalAmount}) must equal registration fee ($${contract.registration_fee}).` },
      { status: 400 }
    );
  }

  // Validate all dates within 14 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 14);

  for (const inst of installments) {
    const d = new Date(inst.proposedDate);
    if (d < today || d > maxDate) {
      return NextResponse.json(
        { error: "All payment dates must be within 14 days of today." },
        { status: 400 }
      );
    }
    if (inst.amount <= 0) {
      return NextResponse.json({ error: "Each installment amount must be greater than 0." }, { status: 400 });
    }
  }

  // Create registration_payment record
  const { data: regPayment, error: regError } = await supabaseAdmin
    .from("registration_payments")
    .upsert(
      {
        job_seeker_id: auth.user.id,
        contract_id: contract.id,
        total_amount: contract.registration_fee,
        amount_paid: 0,
        status: "pending",
        payment_deadline: maxDate.toISOString(),
        work_started: false,
      },
      { onConflict: "job_seeker_id" }
    )
    .select()
    .single();

  if (regError || !regPayment) {
    return NextResponse.json({ error: "Failed to create payment record." }, { status: 500 });
  }

  // Delete old installments and re-insert
  await supabaseAdmin
    .from("payment_installments")
    .delete()
    .eq("registration_payment_id", regPayment.id);

  const installmentRows = installments.map((inst, i) => ({
    registration_payment_id: regPayment.id,
    job_seeker_id: auth.user.id,
    installment_number: i + 1,
    amount: inst.amount,
    proposed_date: inst.proposedDate,
    status: "pending" as const,
  }));

  const { data: savedInstallments, error: instError } = await supabaseAdmin
    .from("payment_installments")
    .insert(installmentRows)
    .select();

  if (instError) {
    return NextResponse.json({ error: "Failed to save installment plan." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, registrationPaymentId: regPayment.id, installments: savedInstallments }, { status: 201 });
}
