import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [requestsRes, screenshotsRes, contractsRes, offersRes, escalationsRes] =
    await Promise.all([
      supabaseAdmin
        .from("payment_requests")
        .select("*, job_seekers(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("payment_screenshots")
        .select("*, job_seekers(full_name, email)")
        .is("acknowledged_at", null)
        .order("uploaded_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("job_seeker_contracts")
        .select("*, job_seekers(full_name, email, plan_type)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("job_offers")
        .select("*, job_seekers(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("termination_escalations")
        .select("*, job_seekers(full_name, email)")
        .is("decision", null)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  return NextResponse.json({
    paymentRequests: requestsRes.data ?? [],
    pendingScreenshots: screenshotsRes.data ?? [],
    contracts: contractsRes.data ?? [],
    offers: offersRes.data ?? [],
    escalations: escalationsRes.data ?? [],
  });
}
