import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";
import OutreachClient from "./OutreachClient";

const REQUIRED_OUTREACH_CONSENTS = [
  "OUTREACH_AUTOMATION",
  "OUTREACH_CONTACT_AUTHORIZATION",
  "OUTREACH_DATA_USAGE",
];

type DraftRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  subject: string | null;
  body: string | null;
  status: string;
  updated_at: string;
  sent_at: string | null;
  last_error: string | null;
  outreach_contacts:
    | {
        role: string | null;
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        role: string | null;
        full_name: string | null;
        email: string | null;
      }>
    | null;
  job_posts:
    | {
        title: string;
        company: string | null;
      }
    | Array<{
        title: string;
        company: string | null;
      }>
    | null;
  job_seekers:
    | {
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
      }>
    | null;
};

type JobSeekerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ConsentRow = {
  jobseeker_id: string;
  consent_type: string;
  accepted_at: string;
  version: string;
};

export default async function OutreachPage() {
  const amEmail = getAmEmailFromHeaders();

  if (!amEmail) {
    return (
      <main>
        <h1>Outreach CRM</h1>
        <p>Missing AM email. Set x-am-email header or AM_EMAIL env var.</p>
      </main>
    );
  }

  const { data: accountManager, error: amError } = await supabaseServer
    .from("account_managers")
    .select("id")
    .eq("email", amEmail)
    .single();

  if (amError || !accountManager) {
    return (
      <main>
        <h1>Outreach CRM</h1>
        <p>Account manager not found for {amEmail}.</p>
      </main>
    );
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", accountManager.id);

  if (assignmentsError) {
    throw new Error("Failed to load job seeker assignments.");
  }

  const seekerIds = (assignments ?? []).map(
    (assignment) => assignment.job_seeker_id
  );

  if (seekerIds.length === 0) {
    return (
      <main>
        <h1>Outreach CRM</h1>
        <p>No assigned job seekers.</p>
      </main>
    );
  }

  const { data: drafts, error: draftError } = await supabaseServer
    .from("outreach_drafts")
    .select(
      "id, job_seeker_id, job_post_id, subject, body, status, updated_at, sent_at, last_error, outreach_contacts (role, full_name, email), job_posts (title, company), job_seekers (full_name, email)"
    )
    .in("job_seeker_id", seekerIds)
    .order("updated_at", { ascending: false });

  if (draftError) {
    throw new Error("Failed to load outreach drafts.");
  }

  const { data: jobSeekers } = await supabaseServer
    .from("job_seekers")
    .select("id, full_name, email")
    .in("id", seekerIds);

  const { data: consentRows } = await supabaseServer
    .from("jobseeker_consents")
    .select("jobseeker_id, consent_type, accepted_at, version")
    .in("jobseeker_id", seekerIds)
    .in("consent_type", REQUIRED_OUTREACH_CONSENTS)
    .order("accepted_at", { ascending: false });

  const consentStatusBySeeker: Record<
    string,
    Record<string, { accepted_at: string; version: string }>
  > = {};
  (consentRows ?? []).forEach((row) => {
    const typedRow = row as ConsentRow;
    if (!consentStatusBySeeker[typedRow.jobseeker_id]) {
      consentStatusBySeeker[typedRow.jobseeker_id] = {};
    }
    if (!consentStatusBySeeker[typedRow.jobseeker_id][typedRow.consent_type]) {
      consentStatusBySeeker[typedRow.jobseeker_id][typedRow.consent_type] = {
        accepted_at: typedRow.accepted_at,
        version: typedRow.version,
      };
    }
  });

  return (
    <main>
      <h1>Outreach CRM</h1>
      <p>Account Manager: {amEmail}</p>
      <nav style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <a href="/dashboard/outreach/recruiters">Recruiters</a>
        <a href="/dashboard/outreach/follow-ups">Follow-ups Due</a>
        <a href="/dashboard/outreach/conversion">Conversion</a>
        <a href="/dashboard/outreach">Drafts</a>
      </nav>
      <h2>Draft Outreach</h2>
      <OutreachClient
        drafts={(drafts ?? []) as DraftRow[]}
        amEmail={amEmail}
        requiredConsents={REQUIRED_OUTREACH_CONSENTS}
        jobSeekers={(jobSeekers ?? []) as JobSeekerRow[]}
        consentStatus={consentStatusBySeeker}
      />
    </main>
  );
}
