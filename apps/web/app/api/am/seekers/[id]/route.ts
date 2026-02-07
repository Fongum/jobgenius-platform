import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";

interface RouteParams {
  params: { id: string };
}

// Check if AM has access to this seeker
async function hasAccess(amId: string, seekerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", amId)
    .eq("job_seeker_id", seekerId)
    .maybeSingle();
  return !!data;
}

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;

  if (!(await hasAccess(auth.user.id, id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: seeker, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !seeker) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }

  return NextResponse.json({ seeker });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;

  if (!(await hasAccess(auth.user.id, id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const body = await request.json();

  // Allow updating these fields
  const allowed = [
    "full_name", "phone", "location", "linkedin_url", "portfolio_url",
    "address_line1", "address_city", "address_state", "address_zip", "address_country",
    "seniority", "work_type", "salary_min", "salary_max",
    "target_titles", "skills", "education", "work_history", "match_threshold",
    "match_weights",
    "preferred_industries", "preferred_company_sizes", "exclude_keywords",
    "years_experience", "preferred_locations", "open_to_relocation",
    "requires_visa_sponsorship",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data: seeker, error } = await supabaseAdmin
    .from("job_seekers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update job seeker." }, { status: 500 });
  }

  return NextResponse.json({ seeker });
}
