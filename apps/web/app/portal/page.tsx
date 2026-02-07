import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

export default async function PortalPage() {
  const user = await getCurrentUser();
  // Layout already handles redirect, but guard for safety
  if (!user) return null;

  // Get job seeker details
  const { data: jobSeeker } = await supabaseAdmin
    .from("job_seekers")
    .select(`
      *,
      job_seeker_assignments (
        account_managers (
          name,
          email
        )
      )
    `)
    .eq("id", user.id)
    .single();

  // Get application stats
  const { count: completedApplications } = await supabaseAdmin
    .from("application_runs")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", user.id)
    .eq("status", "COMPLETED");

  const { count: pendingApplications } = await supabaseAdmin
    .from("application_queue")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", user.id)
    .eq("status", "QUEUED");

  // Get upcoming interviews
  const { data: interviews } = await supabaseAdmin
    .from("interviews")
    .select("*")
    .eq("job_seeker_id", user.id)
    .eq("status", "SCHEDULED")
    .order("scheduled_at", { ascending: true })
    .limit(5);

  // Get unread conversation count
  let unreadConversations = 0;
  const { data: myConvos } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("job_seeker_id", user.id);

  if (myConvos && myConvos.length > 0) {
    const convoIds = myConvos.map((c: { id: string }) => c.id);
    const { count } = await supabaseAdmin
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .eq("sender_type", "account_manager")
      .in("conversation_id", convoIds);
    unreadConversations = count ?? 0;
  }

  const accountManager = jobSeeker?.job_seeker_assignments?.[0]?.account_managers;
  const profileCompletion = jobSeeker?.profile_completion ?? 0;

  // Determine action items
  const actions: { label: string; href: string }[] = [];
  if (!jobSeeker?.phone) actions.push({ label: "Add your phone number", href: "/portal/profile" });
  if (!jobSeeker?.linkedin_url) actions.push({ label: "Add your LinkedIn profile", href: "/portal/profile" });
  if (!jobSeeker?.skills?.length) actions.push({ label: "Add your skills", href: "/portal/profile" });
  if (!jobSeeker?.work_history?.length) actions.push({ label: "Add work history", href: "/portal/profile" });
  if (!jobSeeker?.education?.length) actions.push({ label: "Add education", href: "/portal/profile" });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Profile Completion Banner */}
      {profileCompletion < 80 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-amber-800 font-medium">Complete your profile to get started</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Your account manager will begin searching and applying for jobs once your profile is sufficiently filled out (target: 80%).
            </p>
          </div>
          <Link
            href="/portal/profile"
            className="inline-flex items-center justify-center px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 shrink-0"
          >
            Complete Profile
          </Link>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <p className="text-green-800 text-sm font-medium">
            Your profile is ready &mdash; your account manager is actively working on your behalf.
          </p>
        </div>
      )}

      {/* Welcome + Profile Completion */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Welcome back, {jobSeeker?.full_name || user.email}!
            </h2>
            <p className="text-gray-600 mt-1">
              Your job search is being managed by JobGenius.
            </p>
          </div>
          <Link
            href="/portal/progress"
            className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.915" fill="none" stroke="#3b82f6" strokeWidth="3"
                  strokeDasharray={`${profileCompletion} ${100 - profileCompletion}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-blue-700">
                {profileCompletion}%
              </span>
            </div>
            <span className="text-sm font-medium text-blue-700">Profile</span>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Applications Sent</div>
          <div className="mt-1 text-3xl font-bold text-gray-900">{completedApplications ?? 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">In Queue</div>
          <div className="mt-1 text-3xl font-bold text-blue-600">{pendingApplications ?? 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Upcoming Interviews</div>
          <div className="mt-1 text-3xl font-bold text-green-600">{interviews?.length ?? 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm font-medium text-gray-500">Unread Messages</div>
          <div className="mt-1 text-3xl font-bold text-purple-600">{unreadConversations}</div>
          <Link href="/portal/conversations" className="text-xs text-purple-600 hover:text-purple-800">
            View conversations →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Manager */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Account Manager</h3>
          {accountManager ? (
            <div>
              <p className="text-gray-900 font-medium">{accountManager.name}</p>
              <p className="text-gray-600 text-sm">{accountManager.email}</p>
              <p className="mt-3 text-sm text-gray-500">
                Your account manager is handling your job applications and outreach.
                Contact them if you have any questions.
              </p>
            </div>
          ) : (
            <p className="text-gray-500">No account manager assigned yet.</p>
          )}
        </div>

        {/* Action Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Next Steps</h3>
          {actions.length > 0 ? (
            <ul className="space-y-2">
              {actions.map((action) => (
                <li key={action.label}>
                  <Link
                    href={action.href}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                    {action.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-green-600 font-medium">
              Your profile is looking great! Keep applying.
            </p>
          )}
        </div>
      </div>

      {/* Upcoming Interviews */}
      {interviews && interviews.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Interviews</h3>
            <Link href="/portal/interviews" className="text-sm text-blue-600 hover:text-blue-800">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {interviews.map((interview: Record<string, unknown>) => (
              <div
                key={interview.id as string}
                className="flex justify-between items-center p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{interview.company_name as string}</p>
                  <p className="text-sm text-gray-600">{interview.role_title as string}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(interview.scheduled_at as string).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    {new Date(interview.scheduled_at as string).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {jobSeeker?.skills && jobSeeker.skills.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Your Skills</h3>
            <Link href="/portal/profile" className="text-sm text-blue-600 hover:text-blue-800">
              Edit
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {jobSeeker.skills.map((skill: string) => (
              <span
                key={skill}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
