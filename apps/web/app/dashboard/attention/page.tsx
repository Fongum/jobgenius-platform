import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import AttentionClient from "./AttentionClient";
import { redirect } from "next/navigation";

type RunRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  queue_id: string | null;
  ats_type: string;
  status: string;
  current_step: string;
  last_error: string | null;
  last_error_code: string | null;
  needs_attention_reason: string | null;
  last_seen_url: string | null;
  updated_at: string;
  attention_payload?: Record<string, unknown> | null;
  job_posts:
    | {
        title: string;
        company: string | null;
        location: string | null;
      }
    | Array<{
        title: string;
        company: string | null;
        location: string | null;
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

type PageProps = {
  searchParams?: {
    ats_type?: string;
    reason?: string;
  };
};

const atsOptions = ["LINKEDIN", "GREENHOUSE", "WORKDAY"];
const reasonOptions = [
  "CAPTCHA",
  "OTP_REQUIRED",
  "OTP_EMAIL",
  "OTP_SMS",
  "SMS_OTP",
  "ACCOUNT_CREATE",
  "ACCOUNT_REQUIRED",
  "WORKDAY_ACCOUNT",
  "CREATE_ACCOUNT",
  "REAUTH_REQUIRED",
  "REQUIRED_FIELDS",
  "UNKNOWN_ATS",
  "DRY_RUN_CONFIRM_SUBMIT",
  "NAVIGATION_ERROR",
  "VALIDATION_ERROR",
  "UNKNOWN",
];

export default async function AttentionPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  const atsFilter = searchParams?.ats_type?.trim();
  const reasonFilter = searchParams?.reason?.trim();

  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: assignments, error: assignmentsError } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", user.id);

  if (assignmentsError) {
    console.error("Attention assignments query failed:", assignmentsError);
    return (
      <main>
        <h1>Needs Attention</h1>
        <p>Unable to load assigned job seekers right now.</p>
      </main>
    );
  }

  const seekerIds = (assignments ?? []).map(
    (assignment) => assignment.job_seeker_id
  );

  if (seekerIds.length === 0) {
    return (
      <main>
        <h1>Needs Attention</h1>
        <p>No assigned job seekers.</p>
      </main>
    );
  }

  let query = supabaseServer
    .from("application_runs")
    .select(
      "id, job_seeker_id, job_post_id, queue_id, ats_type, status, current_step, last_error, last_error_code, needs_attention_reason, last_seen_url, updated_at"
    )
    .in("job_seeker_id", seekerIds)
    .eq("status", "NEEDS_ATTENTION");

  if (atsFilter) {
    query = query.eq("ats_type", atsFilter);
  }

  if (reasonFilter) {
    query = query.or(`needs_attention_reason.eq.${reasonFilter},last_error_code.eq.${reasonFilter}`);
  }

  const { data: runRows, error: runError } = await query.order("updated_at", {
    ascending: false,
  });

  if (runError) {
    console.error("Attention runs query failed:", runError);
    return (
      <main>
        <h1>Needs Attention</h1>
        <p>Unable to load attention runs right now.</p>
      </main>
    );
  }

  const rowsWithoutRelations = (runRows ?? []) as Array<{
    id: string;
    job_seeker_id: string;
    job_post_id: string;
    queue_id: string | null;
    ats_type: string;
    status: string;
    current_step: string;
    last_error: string | null;
    last_error_code: string | null;
    needs_attention_reason: string | null;
    last_seen_url: string | null;
    updated_at: string;
  }>;

  const jobSeekerLookup = new Map<string, { full_name: string | null; email: string | null }>();
  if (rowsWithoutRelations.length > 0) {
    const uniqueSeekerIds = Array.from(
      new Set(rowsWithoutRelations.map((row) => row.job_seeker_id).filter(Boolean))
    );
    if (uniqueSeekerIds.length > 0) {
      const { data: seekers } = await supabaseServer
        .from("job_seekers")
        .select("id, full_name, email")
        .in("id", uniqueSeekerIds);
      for (const seeker of seekers ?? []) {
        jobSeekerLookup.set(seeker.id, {
          full_name: seeker.full_name ?? null,
          email: seeker.email ?? null,
        });
      }
    }
  }

  const jobPostLookup = new Map<string, { title: string; company: string | null; location: string | null }>();
  if (rowsWithoutRelations.length > 0) {
    const uniqueJobPostIds = Array.from(
      new Set(rowsWithoutRelations.map((row) => row.job_post_id).filter(Boolean))
    );
    if (uniqueJobPostIds.length > 0) {
      const { data: posts } = await supabaseServer
        .from("job_posts")
        .select("id, title, company, location")
        .in("id", uniqueJobPostIds);
      for (const post of posts ?? []) {
        jobPostLookup.set(post.id, {
          title: post.title,
          company: post.company ?? null,
          location: post.location ?? null,
        });
      }
    }
  }

  const rows: RunRow[] = rowsWithoutRelations.map((row) => ({
    ...row,
    job_posts: jobPostLookup.get(row.job_post_id) ?? null,
    job_seekers: jobSeekerLookup.get(row.job_seeker_id) ?? null,
  }));

  const runIds = rows.map((row) => row.id);
  const payloadByRun: Record<string, Record<string, unknown>> = {};
  if (runIds.length > 0) {
    const { data: eventRows } = await supabaseServer
      .from("apply_run_events")
      .select("run_id, payload, ts")
      .in("run_id", runIds)
      .eq("event_type", "NEEDS_ATTENTION")
      .order("ts", { ascending: false });

    for (const event of eventRows ?? []) {
      if (!payloadByRun[event.run_id]) {
        payloadByRun[event.run_id] = event.payload ?? {};
      }
    }
  }

  const enrichedRows = rows.map((row) => ({
    ...row,
    attention_payload: payloadByRun[row.id] ?? null,
  }));

  return (
    <main>
      <h1>Needs Attention</h1>
      <p>Account Manager: {user.email}</p>
      <form method="get" style={{ display: "flex", gap: "8px" }}>
        <label>
          ATS{" "}
          <select name="ats_type" defaultValue={atsFilter ?? ""}>
            <option value="">All</option>
            {atsOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason{" "}
          <select name="reason" defaultValue={reasonFilter ?? ""}>
            <option value="">All</option>
            {reasonOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      <AttentionClient rows={enrichedRows} />
    </main>
  );
}


