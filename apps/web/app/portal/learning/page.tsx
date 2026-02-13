import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import Link from "next/link";

export default async function LearningDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch published tracks for this seeker
  const { data: tracks } = await supabaseAdmin
    .from("learning_tracks")
    .select(`
      *,
      job_posts ( id, title, company ),
      learning_lessons ( id, estimated_minutes )
    `)
    .eq("job_seeker_id", user.id)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  // Fetch all progress
  const { data: progress } = await supabaseAdmin
    .from("learning_progress")
    .select("lesson_id, status, completed_at, time_spent_seconds")
    .eq("job_seeker_id", user.id);

  const progressMap = new Map(
    (progress ?? []).map((p) => [p.lesson_id, p])
  );

  // Calculate stats
  const allLessons = (tracks ?? []).flatMap(
    (t) => (t.learning_lessons as { id: string; estimated_minutes: number }[]) ?? []
  );
  const totalLessons = allLessons.length;
  const completedLessons = allLessons.filter(
    (l) => progressMap.get(l.id)?.status === "completed"
  ).length;
  const totalTime = (progress ?? []).reduce(
    (sum, p) => sum + (p.time_spent_seconds ?? 0),
    0
  );

  // Calculate streak
  const completedDates = (progress ?? [])
    .filter((p) => p.status === "completed" && p.completed_at)
    .map((p) => new Date(p.completed_at!).toISOString().split("T")[0])
    .sort()
    .reverse();

  const seenDates: Record<string, boolean> = {};
  const uniqueDates = completedDates.filter((date) => {
    if (seenDates[date]) return false;
    seenDates[date] = true;
    return true;
  });
  let streak = 0;
  for (let i = 0; i < uniqueDates.length; i++) {
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() - i);
    const expected = expectedDate.toISOString().split("T")[0];
    if (uniqueDates[i] === expected) {
      streak++;
    } else if (i === 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (uniqueDates[0] === yesterday.toISOString().split("T")[0]) {
        streak = 1;
      } else break;
    } else break;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Learning</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Tracks" value={(tracks ?? []).length} />
        <StatCard
          label="Completed"
          value={`${completedLessons}/${totalLessons}`}
          sub={totalLessons > 0 ? `${Math.round((completedLessons / totalLessons) * 100)}%` : undefined}
        />
        <StatCard
          label="Time Spent"
          value={totalTime >= 3600
            ? `${Math.floor(totalTime / 3600)}h ${Math.floor((totalTime % 3600) / 60)}m`
            : `${Math.floor(totalTime / 60)}m`
          }
        />
        <StatCard label="Streak" value={`${streak} day${streak !== 1 ? "s" : ""}`} />
      </div>

      {/* Tracks */}
      {(tracks ?? []).length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">No learning tracks yet.</p>
          <p className="text-sm text-gray-400">
            Your account manager will create learning tracks for you.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {(tracks ?? []).map((track) => {
            const lessons = (track.learning_lessons as { id: string; estimated_minutes: number }[]) ?? [];
            const completed = lessons.filter(
              (l) => progressMap.get(l.id)?.status === "completed"
            ).length;
            const pct = lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0;
            const jobPost = track.job_posts as { title: string; company: string | null } | null;

            return (
              <Link
                key={track.id}
                href={`/portal/learning/${track.id}`}
                className="block bg-white rounded-lg shadow p-4 sm:p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 truncate">
                      {track.title}
                    </h2>
                    {track.description && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                        {track.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
                        {track.category}
                      </span>
                      <span className="text-xs text-gray-400">
                        {lessons.length} lesson{lessons.length !== 1 ? "s" : ""}
                      </span>
                      {jobPost && (
                        <span className="text-xs text-gray-400 truncate max-w-[150px]">
                          {jobPost.title}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0">{pct}%</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {completed} of {lessons.length} lessons completed
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-blue-600 mt-0.5">{sub}</p>}
    </div>
  );
}
