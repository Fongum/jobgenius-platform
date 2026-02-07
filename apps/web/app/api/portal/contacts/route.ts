import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/portal/contacts
 *
 * Returns outreach contacts for the logged-in job seeker.
 */
export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  let query = supabaseAdmin
    .from("outreach_contacts")
    .select("id, full_name, role, email, company_name, linkedin_url, phone, source, created_at")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,company_name.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data: contacts, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to load contacts." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    contacts: contacts || [],
    total: (contacts || []).length,
  });
}
