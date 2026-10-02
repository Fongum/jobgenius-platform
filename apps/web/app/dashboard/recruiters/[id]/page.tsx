import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { DIRECTORY_OPT_OUT_SOURCE, getVisibleRecruiter } from "@/lib/recruiter-directory";
import RecruiterActions from "./RecruiterActions";
import {
  Badge,
  DoNotContactBadge,
  REQUEST_STATUS_BADGE,
  StageBadge,
  formatDate,
  humanize,
} from "../ui";

type ThreadRow = {
  id: string;
  job_seeker_id: string;
  stage: string;
  thread_status: string;
  last_reply_at: string | null;
  next_follow_up_at: string | null;
  created_at: string | null;
  job_seekers: { full_name: string | null } | Array<{ full_name: string | null }> | null;
};

type RequestRow = {
  id: string;
  role_title: string | null;
  company_name: string;
  client_company_name: string | null;
  location: string;
  status: string;
  hiring_urgency: string | null;
  assigned_account_manager_id: string | null;
  created_at: string;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-gray-400 text-xs uppercase tracking-wide block">{label}</span>
      <span className="text-gray-700">{children}</span>
    </div>
  );
}

export default async function RecruiterDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") redirect("/login");

  const isAdmin = isAdminRole(user.role);
  const recruiter = await getVisibleRecruiter({ id: user.id, isAdmin }, params.id);
  if (!recruiter) notFound();

  const { data: assignmentRows } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", user.id);
  const mySeekerIds = new Set((assignmentRows ?? []).map((row) => row.job_seeker_id as string));

  let threadQuery = supabaseAdmin
    .from("recruiter_threads")
    .select(
      "id, job_seeker_id, stage, thread_status, last_reply_at, next_follow_up_at, created_at, job_seekers (full_name)"
    )
    .eq("recruiter_id", recruiter.id)
    .order("created_at", { ascending: false });
  if (!isAdmin) {
    // Other AMs' seekers are counted on the directory row, never listed.
    threadQuery = threadQuery.in("job_seeker_id", Array.from(mySeekerIds));
  }

  const [
    { data: threadData },
    { data: requestData },
    { data: details },
    { data: optOut },
    { data: managerData },
  ] = await Promise.all([
    mySeekerIds.size > 0 || isAdmin ? threadQuery : Promise.resolve({ data: [] }),
    supabaseAdmin
      .from("recruiter_role_requests")
      .select(
        "id, role_title, company_name, client_company_name, location, status, hiring_urgency, assigned_account_manager_id, created_at"
      )
      .eq("recruiter_id", recruiter.id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("recruiters")
      .select("phone, company_domain, intake_source, preferred_contact_method")
      .eq("id", recruiter.id)
      .maybeSingle(),
    supabaseAdmin
      .from("recruiter_opt_outs")
      .select("source, reason, opted_out_at")
      .eq("recruiter_id", recruiter.id)
      .maybeSingle(),
    isAdmin
      ? supabaseAdmin
          .from("account_managers")
          .select("id, name, email")
          .eq("status", "approved")
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const threads = (threadData ?? []) as ThreadRow[];
  const requests = (requestData ?? []) as RequestRow[];
  const managers = (managerData ?? []) as Array<{ id: string; name: string | null; email: string }>;

  // Who handles each thread / request that isn't the viewer's. Admin-only:
  // an AM never sees other AMs' threads in the first place.
  const managerNames = new Map<string, string>();
  for (const manager of managers) managerNames.set(manager.id, manager.name || manager.email);
  const threadOwner = new Map<string, string>();
  if (isAdmin) {
    const otherSeekerIds = threads.map((t) => t.job_seeker_id).filter((id) => !mySeekerIds.has(id));
    if (otherSeekerIds.length > 0) {
      const { data: otherAssignments } = await supabaseAdmin
        .from("job_seeker_assignments")
        .select("job_seeker_id, account_manager_id")
        .in("job_seeker_id", otherSeekerIds);
      for (const row of otherAssignments ?? []) {
        const name = managerNames.get(row.account_manager_id as string);
        if (name) threadOwner.set(row.job_seeker_id as string, name);
      }
    }
  }

  const blocked = recruiter.do_not_contact || recruiter.opted_out;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link href="/dashboard/recruiters" className="text-sm text-violet-700 hover:underline">
        ← All recruiters
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {recruiter.partner_type && (
            <Badge className="bg-teal-50 text-teal-700">{humanize(recruiter.partner_type)}</Badge>
          )}
          {blocked && <DoNotContactBadge />}
          {recruiter.best_stage && <StageBadge stage={recruiter.best_stage} />}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {recruiter.name || recruiter.email || "Unnamed recruiter"}
        </h1>
        {(recruiter.title || recruiter.company) && (
          <p className="text-gray-600 mb-4">
            {recruiter.title}
            {recruiter.title && recruiter.company && " at "}
            {recruiter.company}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6 text-sm">
          <Field label="Email">
            {recruiter.email ? (
              <a href={`mailto:${recruiter.email}`} className="text-violet-600 hover:underline">
                {recruiter.email}
              </a>
            ) : (
              "—"
            )}
          </Field>
          {details?.phone && <Field label="Phone">{details.phone as string}</Field>}
          {recruiter.linkedin_url && (
            <Field label="LinkedIn">
              <a
                href={recruiter.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 hover:underline truncate block"
              >
                {recruiter.linkedin_url}
              </a>
            </Field>
          )}
          {details?.company_domain && <Field label="Domain">{details.company_domain as string}</Field>}
          <Field label="Source">
            {humanize((details?.intake_source as string | null) ?? recruiter.source) || "—"}
          </Field>
          <Field label="Last contacted">{formatDate(recruiter.last_contacted_at)}</Field>
          <Field label="Added">{formatDate(recruiter.created_at)}</Field>
        </div>
      </div>

      <RecruiterActions
        recruiterId={recruiter.id}
        viewerId={user.id}
        isAdmin={isAdmin}
        notes={recruiter.notes}
        ownerId={recruiter.owner_account_manager_id}
        ownerName={recruiter.owner_name}
        doNotContact={recruiter.do_not_contact}
        optOut={
          optOut
            ? {
                source: (optOut.source as string | null) ?? "unknown",
                reason: (optOut.reason as string | null) ?? null,
                optedOutAt: (optOut.opted_out_at as string | null) ?? null,
                liftable: optOut.source === DIRECTORY_OPT_OUT_SOURCE,
              }
            : null
        }
        managers={managers.map((m) => ({ id: m.id, label: m.name || m.email }))}
      />

      <section className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Outreach threads</h2>
          {recruiter.hidden_thread_count > 0 && (
            <span className="text-xs text-gray-500">
              +{recruiter.hidden_thread_count} with other AMs&apos; seekers
            </span>
          )}
        </div>
        {threads.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">
            {isAdmin ? "No outreach to this recruiter yet." : "None of your seekers have written to this recruiter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Seeker</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Thread</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last reply</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Next follow-up</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {threads.map((thread) => {
                  const isOwn = mySeekerIds.has(thread.job_seeker_id);
                  return (
                    <tr key={thread.id}>
                      <td className="px-6 py-3 text-gray-900">
                        {one(thread.job_seekers)?.full_name ?? "Job seeker"}
                        {!isOwn && (
                          <div className="text-xs text-gray-500">
                            {threadOwner.get(thread.job_seeker_id) ?? "Another AM"}&apos;s seeker
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StageBadge stage={thread.stage} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{humanize(thread.thread_status).toLowerCase()}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(thread.last_reply_at)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(thread.next_follow_up_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {isOwn && (
                          <Link
                            href={`/dashboard/outreach/threads/${thread.id}`}
                            className="text-violet-700 hover:underline"
                          >
                            Open
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Hiring requests</h2>
          {isAdmin && requests.length > 0 && (
            <Link href="/dashboard/admin/hiring-partners" className="text-sm text-violet-700 hover:underline">
              Open in Hiring Requests
            </Link>
          )}
        </div>
        {requests.length === 0 ? (
          <p className="px-6 py-8 text-sm text-gray-500">This recruiter hasn&apos;t sent us any roles.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {requests.map((request) => (
              <li key={request.id} className="px-6 py-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-gray-900">{request.role_title || "Untitled role"}</div>
                  <div className="text-sm text-gray-600">
                    {request.client_company_name || request.company_name} · {request.location}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Received {formatDate(request.created_at)}
                    {request.hiring_urgency && ` · ${humanize(request.hiring_urgency)} urgency`}
                    {request.assigned_account_manager_id === user.id
                      ? " · assigned to you"
                      : request.assigned_account_manager_id && isAdmin
                        ? ` · ${managerNames.get(request.assigned_account_manager_id) ?? "assigned"}`
                        : ""}
                  </div>
                </div>
                <Badge className={REQUEST_STATUS_BADGE[request.status] ?? "bg-gray-100 text-gray-600"}>
                  {humanize(request.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
