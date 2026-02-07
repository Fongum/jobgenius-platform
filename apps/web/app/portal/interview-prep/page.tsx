import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";

export default async function InterviewPrepListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: preps } = await supabaseAdmin
    .from("interview_prep")
    .select(`
      *,
      job_posts ( title, company )
    `)
    .eq("job_seeker_id", user.id)
    .order("updated_at", { ascending: false });

  // Get related interviews for context
  const { data: interviews } = await supabaseAdmin
    .from("interviews")
    .select("id, job_post_id, scheduled_at, status")
    .eq("job_seeker_id", user.id)
    .in("status", ["confirmed", "pending_candidate"]);

  // Map job_post_id -> interview
  type InterviewInfo = { id: string; job_post_id: string; scheduled_at: string | null; status: string };
  const interviewByJob = new Map<string, InterviewInfo>();
  (interviews ?? []).forEach((iv: Record<string, unknown>) => {
    if (iv.job_post_id) {
      interviewByJob.set(iv.job_post_id as string, iv as unknown as InterviewInfo);
    }
  });

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Interview Preparation
      </h2>

      {!preps || preps.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-gray-500">No interview preparations yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Your account manager will create interview prep materials when you
            have upcoming interviews.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {preps.map((prep: Record<string, unknown>) => {
            const jobPost = prep.job_posts as { title: string; company: string | null } | null;
            const content = prep.content as { role_summary?: string; likely_questions?: string[] } | null;
            const interview = interviewByJob.get(
              prep.job_post_id as string
            );

            return (
              <Link
                key={prep.id as string}
                href={`/portal/interview-prep/${prep.id}`}
                className="block bg-white rounded-lg shadow p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      {jobPost?.title || "Untitled Position"}
                    </h3>
                    {jobPost?.company && (
                      <p className="text-sm text-gray-500">
                        {jobPost.company}
                      </p>
                    )}
                  </div>
                  {interview?.scheduled_at && (
                    <span className="inline-block px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                      Interview:{" "}
                      {new Date(
                        interview.scheduled_at as string
                      ).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {content?.role_summary && (
                  <p className="text-sm text-gray-600 mt-2">
                    {content.role_summary}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  <span>
                    {(content?.likely_questions ?? []).length}{" "}
                    questions
                  </span>
                  <span>
                    Updated{" "}
                    {new Date(
                      prep.updated_at as string
                    ).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex gap-2 mt-3">
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                    Study Notes
                  </span>
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                    Practice
                  </span>
                  <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs">
                    Videos
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
