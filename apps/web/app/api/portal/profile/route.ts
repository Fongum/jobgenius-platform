import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", auth.user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

export async function PATCH(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();

  // Only allow updating specific fields
  const allowed = [
    "full_name", "phone", "location", "linkedin_url", "portfolio_url",
    "address_line1", "address_city", "address_state", "address_zip", "address_country",
    "seniority", "work_type", "salary_min", "salary_max",
    "target_titles", "skills", "education", "work_history",
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

  const { data, error } = await supabaseAdmin
    .from("job_seekers")
    .update(updates)
    .eq("id", auth.user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
