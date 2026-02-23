import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = auth.user.id;

  const [contractRes, regPaymentRes, installmentsRes, offersRes, flexRequestRes] =
    await Promise.all([
      supabaseAdmin
        .from("job_seeker_contracts")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("registration_payments")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("payment_installments")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("installment_number", { ascending: true }),
      supabaseAdmin
        .from("job_offers")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("registration_flex_requests")
        .select("*")
        .eq("job_seeker_id", seekerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Fetch payment requests linked to this seeker
  const { data: paymentRequests } = await supabaseAdmin
    .from("payment_requests")
    .select("*")
    .eq("job_seeker_id", seekerId)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    contract: contractRes.data,
    registrationPayment: regPaymentRes.data,
    installments: installmentsRes.data ?? [],
    offers: offersRes.data ?? [],
    paymentRequests: paymentRequests ?? [],
    flexRequest: flexRequestRes.data ?? null,
  });
}
