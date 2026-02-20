import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import BillingAdminClient from "./BillingAdminClient";

export default async function AdminBillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !["admin", "superadmin"].includes(user.role ?? "")) {
    redirect("/dashboard");
  }

  const [requestsRes, screenshotsRes, contractsRes, offersRes, escalationsRes] =
    await Promise.all([
      supabaseAdmin
        .from("payment_requests")
        .select("*, job_seekers(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("payment_screenshots")
        .select("*, job_seekers(id, full_name, email)")
        .order("uploaded_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("job_seeker_contracts")
        .select("*, job_seekers(id, full_name, email, plan_type)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("job_offers")
        .select("*, job_seekers(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("termination_escalations")
        .select("*, job_seekers(id, full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  return (
    <BillingAdminClient
      paymentRequests={requestsRes.data ?? []}
      screenshots={screenshotsRes.data ?? []}
      contracts={contractsRes.data ?? []}
      offers={offersRes.data ?? []}
      escalations={escalationsRes.data ?? []}
    />
  );
}
