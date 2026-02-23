import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import BillingClient from "./BillingClient";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "job_seeker") redirect("/dashboard");

  const seekerId = user.id;

  const [
    contractRes,
    regPaymentRes,
    installmentsRes,
    offersRes,
    requestsRes,
    flexRequestRes,
  ] =
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
        .from("payment_requests")
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

  return (
    <BillingClient
      contract={contractRes.data}
      registrationPayment={regPaymentRes.data}
      installments={installmentsRes.data ?? []}
      offers={offersRes.data ?? []}
      paymentRequests={requestsRes.data ?? []}
      flexRequest={flexRequestRes.data ?? null}
      seekerId={seekerId}
      userEmail={user.email}
    />
  );
}
