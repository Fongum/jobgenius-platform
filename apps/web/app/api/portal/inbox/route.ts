import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth/middleware";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/portal/inbox
 * Returns the seeker's classified inbound emails.
 */
export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const classification = url.searchParams.get("classification");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  let query = supabaseServer
    .from("inbound_emails")
    .select(
      "id, gmail_message_id, thread_id, from_email, from_name, subject, body_snippet, received_at, classification, classification_confidence, matched_application_id, matched_job_post_id, extracted_data, is_processed, created_at"
    )
    .eq("job_seeker_id", auth.user.id)
    .order("received_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (classification && classification !== "all") {
    query = query.eq("classification", classification);
  }

  const { data: emails, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to load inbox" },
      { status: 500 }
    );
  }

  // Get counts by classification
  const { data: allEmails } = await supabaseServer
    .from("inbound_emails")
    .select("classification")
    .eq("job_seeker_id", auth.user.id);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const e of allEmails ?? []) {
    counts[e.classification] = (counts[e.classification] ?? 0) + 1;
    total++;
  }

  return NextResponse.json({
    emails: emails ?? [],
    counts,
    total,
  });
}
