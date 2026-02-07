import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";

type ContactPayload = {
  job_seeker_id?: string;
  contacts: {
    full_name: string;
    role?: string;
    email?: string;
    company_name?: string;
    linkedin_url?: string;
    phone?: string;
    source?: string;
  }[];
};

/**
 * GET /api/extension/contacts
 *
 * List outreach contacts for the active job seeker.
 */
export async function GET(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    if (!session.active_job_seeker_id) {
      return NextResponse.json(
        { error: "No active job seeker selected." },
        { status: 400 }
      );
    }

    const { data: contacts, error } = await supabaseAdmin
      .from("outreach_contacts")
      .select("id, full_name, role, email, company_name, linkedin_url, phone, source, created_at")
      .eq("job_seeker_id", session.active_job_seeker_id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching contacts:", error);
      return NextResponse.json(
        { error: "Failed to fetch contacts." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      contacts: contacts || [],
      total: (contacts || []).length,
    });
  } catch (error) {
    console.error("Extension contacts GET error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/extension/contacts
 *
 * Save scraped contacts for a job seeker.
 * Body: { job_seeker_id?, contacts: [{ full_name, role, email, company_name, linkedin_url, phone, source }] }
 */
export async function POST(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    let payload: ContactPayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const job_seeker_id = payload.job_seeker_id || session.active_job_seeker_id;

    if (!job_seeker_id) {
      return NextResponse.json(
        { error: "No job seeker specified or active." },
        { status: 400 }
      );
    }

    if (!payload.contacts || payload.contacts.length === 0) {
      return NextResponse.json(
        { error: "No contacts provided." },
        { status: 400 }
      );
    }

    // Verify AM has access to this job seeker
    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", session.account_manager_id)
      .eq("job_seeker_id", job_seeker_id)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Not authorized for this job seeker." },
        { status: 403 }
      );
    }

    // Insert contacts
    const contactRows = payload.contacts.map((c) => ({
      job_seeker_id,
      full_name: c.full_name,
      role: c.role || null,
      email: c.email || null,
      company_name: c.company_name || null,
      linkedin_url: c.linkedin_url || null,
      phone: c.phone || null,
      source: c.source || "extension_scrape",
      scraped_by_am_id: session.account_manager_id,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("outreach_contacts")
      .insert(contactRows);

    if (insertError) {
      console.error("Error saving contacts:", insertError);
      return NextResponse.json(
        { error: "Failed to save contacts." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      saved: contactRows.length,
    });
  } catch (error) {
    console.error("Extension contacts POST error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
