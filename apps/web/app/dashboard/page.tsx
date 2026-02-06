import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Get assigned job seekers
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", user.id);

  const seekerIds = (assignments || []).map((a) => a.job_seeker_id);

  // Get stats
  const { count: totalSeekers } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("id", { count: "exact", head: true })
    .eq("account_manager_id", user.id);

  let needsAttention = 0;
  let queuedCount = 0;
  let appliedCount = 0;
  let interviewsCount = 0;

  if (seekerIds.length > 0) {
    const { count: attentionCount } = await supabaseAdmin
      .from("application_runs")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds)
      .eq("status", "NEEDS_ATTENTION");
    needsAttention = attentionCount ?? 0;

    const { count: qCount } = await supabaseAdmin
      .from("application_queue")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds)
      .eq("status", "QUEUED");
    queuedCount = qCount ?? 0;

    const { count: aCount } = await supabaseAdmin
      .from("application_runs")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds)
      .in("status", ["APPLIED", "COMPLETED"]);
    appliedCount = aCount ?? 0;

    const { count: iCount } = await supabaseAdmin
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .in("job_seeker_id", seekerIds)
      .eq("status", "confirmed")
      .gte("scheduled_at", new Date().toISOString());
    interviewsCount = iCount ?? 0;
  }

  // Get recent activity (last 5 application runs)
  const { data: recentRuns } = seekerIds.length > 0
    ? await supabaseAdmin
        .from("application_runs")
        .select(`
          id, status, created_at, updated_at,
          job_seekers!inner(full_name),
          job_posts!inner(title, company)
        `)
        .in("job_seeker_id", seekerIds)
        .order("updated_at", { ascending: false })
        .limit(5)
    : { data: [] };

  // Get upcoming interviews
  const { data: upcomingInterviews } = seekerIds.length > 0
    ? await supabaseAdmin
        .from("interviews")
        .select(`
          id, scheduled_at, interview_type,
          job_seekers!inner(full_name),
          job_posts!inner(title, company)
        `)
        .in("job_seeker_id", seekerIds)
        .eq("status", "confirmed")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(5)
    : { data: [] };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user.name || user.email}</p>
        </div>

        {/* AM Code for Extension Login */}
        {user.amCode && (
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-purple-200">Your Extension Code</p>
                <p className="text-xl font-bold font-mono tracking-wider">{user.amCode}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alert Banner */}
      {needsAttention > 0 && (
        <Link
          href="/dashboard/attention"
          className="block bg-orange-50 border border-orange-200 rounded-lg p-4 hover:bg-orange-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-orange-800">
                {needsAttention} application{needsAttention !== 1 ? "s" : ""} need attention
              </p>
              <p className="text-sm text-orange-600">Click to view and resolve</p>
            </div>
          </div>
        </Link>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/seekers" className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow">
          <div className="text-sm font-medium text-gray-500">Job Seekers</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{totalSeekers ?? 0}</div>
        </Link>
        <Link href="/dashboard/queue" className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow">
          <div className="text-sm font-medium text-gray-500">In Queue</div>
          <div className="mt-1 text-3xl font-bold text-blue-600">{queuedCount}</div>
        </Link>
        <Link href="/dashboard/applied" className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow">
          <div className="text-sm font-medium text-gray-500">Applied</div>
          <div className="mt-1 text-3xl font-bold text-green-600">{appliedCount}</div>
        </Link>
        <Link href="/dashboard/interviews" className="bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow">
          <div className="text-sm font-medium text-gray-500">Upcoming Interviews</div>
          <div className="mt-1 text-3xl font-bold text-purple-600">{interviewsCount}</div>
        </Link>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Activity</h2>
            <Link href="/dashboard/queue" className="text-sm text-blue-600 hover:text-blue-800">
              View all
            </Link>
          </div>
          <div className="divide-y">
            {(!recentRuns || recentRuns.length === 0) ? (
              <p className="px-5 py-4 text-sm text-gray-500">No recent activity</p>
            ) : (
              recentRuns.map((run: Record<string, unknown>) => {
                const seeker = run.job_seekers as { full_name: string } | null;
                const job = run.job_posts as { title: string; company: string } | null;
                return (
                  <div key={run.id as string} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {seeker?.full_name || "Unknown"} - {job?.title || "Unknown Job"}
                        </p>
                        <p className="text-xs text-gray-500">{job?.company}</p>
                      </div>
                      <StatusBadge status={run.status as string} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Interviews */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Upcoming Interviews</h2>
            <Link href="/dashboard/interviews" className="text-sm text-blue-600 hover:text-blue-800">
              View all
            </Link>
          </div>
          <div className="divide-y">
            {(!upcomingInterviews || upcomingInterviews.length === 0) ? (
              <p className="px-5 py-4 text-sm text-gray-500">No upcoming interviews</p>
            ) : (
              upcomingInterviews.map((interview: Record<string, unknown>) => {
                const seeker = interview.job_seekers as { full_name: string } | null;
                const job = interview.job_posts as { title: string; company: string } | null;
                const date = new Date(interview.scheduled_at as string);
                return (
                  <div key={interview.id as string} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {seeker?.full_name || "Unknown"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {job?.company} - {job?.title}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {date.toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/seekers"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Job Seekers
          </Link>
          <Link
            href="/dashboard/attention"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Resolve Issues
          </Link>
          <Link
            href="/dashboard/outreach"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Manage Outreach
          </Link>
          <Link
            href="/dashboard/interview-slots"
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Set Availability
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    QUEUED: "bg-yellow-100 text-yellow-800",
    RUNNING: "bg-blue-100 text-blue-800",
    PAUSED: "bg-gray-100 text-gray-800",
    READY: "bg-blue-100 text-blue-800",
    RETRYING: "bg-blue-100 text-blue-800",
    APPLIED: "bg-green-100 text-green-800",
    COMPLETED: "bg-green-100 text-green-800",
    NEEDS_ATTENTION: "bg-orange-100 text-orange-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[status] || "bg-gray-100 text-gray-800"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
