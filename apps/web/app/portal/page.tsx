import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import LogoutButton from "./logout-button";

export default async function PortalPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.userType !== "job_seeker") {
    redirect("/dashboard");
  }

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
  const { count: totalApplications } = await supabaseAdmin
    .from("application_runs")
    .select("id", { count: "exact", head: true })
    .eq("job_seeker_id", user.id);

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

  const accountManager = jobSeeker?.job_seeker_assignments?.[0]?.account_managers;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">JobGenius Portal</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user.name || user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Welcome back, {jobSeeker?.full_name || user.email}!
          </h2>
          <p className="text-gray-600">
            Your job search is being managed by JobGenius. Here&apos;s your current status.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Applications Sent</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {completedApplications ?? 0}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">In Queue</div>
            <div className="mt-2 text-3xl font-bold text-blue-600">
              {pendingApplications ?? 0}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">Upcoming Interviews</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {interviews?.length ?? 0}
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Account Manager */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Your Account Manager
            </h3>
            {accountManager ? (
              <div>
                <p className="text-gray-900 font-medium">{accountManager.name}</p>
                <p className="text-gray-600 text-sm">{accountManager.email}</p>
                <p className="mt-4 text-sm text-gray-500">
                  Your account manager is handling your job applications and outreach.
                  Contact them if you have any questions.
                </p>
              </div>
            ) : (
              <p className="text-gray-500">
                No account manager assigned yet.
              </p>
            )}
          </div>

          {/* Profile Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Your Profile
            </h3>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-gray-500">Location</dt>
                <dd className="text-gray-900">{jobSeeker?.location || "Not set"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Seniority</dt>
                <dd className="text-gray-900">{jobSeeker?.seniority || "Not set"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Work Type</dt>
                <dd className="text-gray-900">{jobSeeker?.work_type || "Not set"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Target Salary</dt>
                <dd className="text-gray-900">
                  {jobSeeker?.salary_min && jobSeeker?.salary_max
                    ? `$${jobSeeker.salary_min.toLocaleString()} - $${jobSeeker.salary_max.toLocaleString()}`
                    : "Not set"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Upcoming Interviews */}
        {interviews && interviews.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Upcoming Interviews
            </h3>
            <div className="space-y-4">
              {interviews.map((interview: any) => (
                <div
                  key={interview.id}
                  className="flex justify-between items-center p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{interview.company_name}</p>
                    <p className="text-sm text-gray-600">{interview.role_title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(interview.scheduled_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(interview.scheduled_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {jobSeeker?.skills && jobSeeker.skills.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Your Skills
            </h3>
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
      </main>
    </div>
  );
}
