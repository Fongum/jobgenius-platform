import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import {
  generateNetworkOutreachEmail,
  generateNetworkOutreachText,
} from "@/lib/network/message-generation";

// POST: Generate a personalized outreach message
export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { match_id: string; message_type: "email" | "text" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.match_id || !body.message_type) {
    return NextResponse.json(
      { error: "match_id and message_type are required." },
      { status: 400 }
    );
  }

  if (body.message_type !== "email" && body.message_type !== "text") {
    return NextResponse.json(
      { error: "message_type must be 'email' or 'text'." },
      { status: 400 }
    );
  }

  // Load match with all related data
  const { data: match } = await supabaseAdmin
    .from("network_contact_matches")
    .select(`
      id, match_reason, status,
      network_contacts (id, full_name, contact_type, company_name, job_title, account_manager_id),
      job_posts (id, title, company, description_text, url),
      job_seekers (id, full_name, email)
    `)
    .eq("id", body.match_id)
    .single();

  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const contact = match.network_contacts as unknown as {
    id: string;
    full_name: string;
    contact_type: "recruiter" | "referral";
    company_name: string | null;
    job_title: string | null;
    account_manager_id: string;
  };

  if (contact.account_manager_id !== auth.user.id) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const jobPost = match.job_posts as unknown as {
    id: string;
    title: string | null;
    company: string | null;
    description_text: string | null;
    url: string | null;
  };

  const seeker = match.job_seekers as unknown as {
    id: string;
    full_name: string | null;
    email: string;
  };

  try {
    if (body.message_type === "email") {
      const result = await generateNetworkOutreachEmail(
        contact,
        { match_reason: match.match_reason },
        seeker,
        jobPost
      );
      return NextResponse.json({ type: "email", ...result });
    } else {
      const text = await generateNetworkOutreachText(
        contact,
        { match_reason: match.match_reason },
        seeker,
        jobPost
      );
      return NextResponse.json({ type: "text", text });
    }
  } catch (err) {
    console.error("Message generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate message." },
      { status: 500 }
    );
  }
}
