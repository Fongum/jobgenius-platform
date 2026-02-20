import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { buildContactSuggestions } from "@/lib/outreach";

type ContactRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  email: string | null;
  company_name: string | null;
  linkedin_url: string | null;
  source: string | null;
  created_at: string;
};

type JobPostContext = {
  id: string;
  title: string | null;
  company: string | null;
  company_website: string | null;
};

type ReferrerEntry = {
  id: string | null;
  full_name: string | null;
  role: string | null;
  email: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  source: string;
};

function toEpoch(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeKey(contact: ContactRow) {
  if (contact.email) {
    return `email:${contact.email.toLowerCase()}`;
  }
  if (contact.linkedin_url) {
    return `linkedin:${contact.linkedin_url.toLowerCase()}`;
  }
  return `name:${(contact.full_name ?? "").toLowerCase()}|role:${(contact.role ?? "").toLowerCase()}`;
}

function classifyRole(role: string | null | undefined) {
  const value = (role ?? "").toLowerCase();
  if (
    /(recruit|talent|hr|human resources|people ops|staffing)/.test(value)
  ) {
    return "hr";
  }
  if (/(manager|director|head|vp|vice president|chief|lead)/.test(value)) {
    return "management";
  }
  return "peers";
}

function dedupeContacts(rows: ContactRow[]) {
  const map = new Map<string, ContactRow>();
  for (const row of rows) {
    const key = normalizeKey(row);
    const existing = map.get(key);
    if (!existing || toEpoch(row.created_at) >= toEpoch(existing.created_at)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

function toReferrerEntry(contact: ContactRow): ReferrerEntry {
  return {
    id: contact.id,
    full_name: contact.full_name,
    role: contact.role,
    email: contact.email,
    linkedin_url: contact.linkedin_url,
    company_name: contact.company_name,
    source: contact.source ?? "outreach_contacts",
  };
}

/**
 * GET /api/extension/referrers
 *
 * Query params:
 * - job_post_id?: UUID
 * - company?: string
 */
export async function GET(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    if (!session.active_job_seeker_id) {
      return NextResponse.json(
        { success: false, error: "No active job seeker selected." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobPostId = searchParams.get("job_post_id");
    const companyFromQuery = searchParams.get("company")?.trim() || null;

    let jobPost: JobPostContext | null = null;
    if (jobPostId) {
      const { data } = await supabaseAdmin
        .from("job_posts")
        .select("id, title, company, company_website")
        .eq("id", jobPostId)
        .maybeSingle();
      jobPost = (data as JobPostContext | null) ?? null;
    }

    const companyName = companyFromQuery ?? jobPost?.company ?? null;
    const companyWebsite = jobPost?.company_website ?? null;

    let contactsQuery = supabaseAdmin
      .from("outreach_contacts")
      .select(
        "id, full_name, role, email, company_name, linkedin_url, source, created_at"
      )
      .eq("job_seeker_id", session.active_job_seeker_id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (companyName) {
      contactsQuery = contactsQuery.ilike("company_name", `%${companyName}%`);
    }

    const { data: contactRows, error } = await contactsQuery;

    if (error) {
      console.error("Extension referrers query error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to load referrers." },
        { status: 500 }
      );
    }

    const deduped = dedupeContacts((contactRows ?? []) as ContactRow[]);
    const grouped = {
      hr: [] as ReferrerEntry[],
      management: [] as ReferrerEntry[],
      peers: [] as ReferrerEntry[],
    };

    for (const contact of deduped) {
      const bucket = classifyRole(contact.role);
      grouped[bucket].push(toReferrerEntry(contact));
    }

    const suggestions = buildContactSuggestions({
      companyName,
      companyWebsite,
    });

    // Ensure we always return at least one recruiter and one management fallback when real contacts are absent.
    if (grouped.hr.length === 0) {
      const recruiterSuggestion = suggestions.find((item) =>
        /(recruit|talent|hr)/i.test(item.role)
      );
      if (recruiterSuggestion) {
        grouped.hr.push({
          id: null,
          full_name: recruiterSuggestion.full_name,
          role: recruiterSuggestion.role,
          email: recruiterSuggestion.email,
          linkedin_url: null,
          company_name: companyName,
          source: "suggested",
        });
      }
    }

    if (grouped.management.length === 0) {
      const managerSuggestion = suggestions.find(
        (item) => !/(recruit|talent|hr)/i.test(item.role)
      );
      if (managerSuggestion) {
        grouped.management.push({
          id: null,
          full_name: managerSuggestion.full_name,
          role: managerSuggestion.role,
          email: managerSuggestion.email,
          linkedin_url: null,
          company_name: companyName,
          source: "suggested",
        });
      }
    }

    return NextResponse.json({
      success: true,
      company_name: companyName,
      job_post_id: jobPost?.id ?? null,
      job_title: jobPost?.title ?? null,
      groups: grouped,
      totals: {
        hr: grouped.hr.length,
        management: grouped.management.length,
        peers: grouped.peers.length,
        all: grouped.hr.length + grouped.management.length + grouped.peers.length,
      },
    });
  } catch (error) {
    console.error("Extension referrers error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}

