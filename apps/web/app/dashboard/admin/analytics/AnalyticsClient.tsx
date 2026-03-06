"use client";

type Funnel = {
  total_seekers: number;
  assigned: number;
  applied: number;
  interviewed: number;
  placed: number;
};

type Metrics = {
  interviews_this_month: number;
  interviews_prev_month: number;
  applications_this_month: number;
  applications_prev_month: number;
};

type LeaderboardEntry = {
  id: string;
  full_name: string | null;
  photo: string | null;
  total_seekers: number;
  placed: number;
  interviews: number;
  placement_rate: number;
};

function pct(a: number, base: number): number {
  if (base === 0) return 0;
  return Math.round((a / base) * 100);
}

function trendLabel(current: number, prev: number): { text: string; up: boolean } {
  if (prev === 0) return { text: current > 0 ? "↑ new" : "—", up: true };
  const diff = current - prev;
  const sign = diff >= 0 ? "↑" : "↓";
  const pctChange = Math.abs(Math.round((diff / prev) * 100));
  return { text: `${sign} ${pctChange}% vs last month`, up: diff >= 0 };
}

export default function AnalyticsClient({
  funnel,
  metrics,
  leaderboard,
}: {
  funnel: Funnel;
  metrics: Metrics;
  leaderboard: LeaderboardEntry[];
}) {
  const ivTrend = trendLabel(metrics.interviews_this_month, metrics.interviews_prev_month);
  const appTrend = trendLabel(metrics.applications_this_month, metrics.applications_prev_month);

  const funnelSteps = [
    { label: "Total Seekers", value: funnel.total_seekers, color: "bg-blue-500" },
    { label: "Assigned to AM", value: funnel.assigned, color: "bg-indigo-500" },
    { label: "Applied", value: funnel.applied, color: "bg-violet-500" },
    { label: "Interviewed", value: funnel.interviewed, color: "bg-purple-500" },
    { label: "Placed", value: funnel.placed, color: "bg-green-500" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of all placement activity across the platform</p>
      </div>

      {/* Month metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Interviews This Month</p>
          <p className="text-4xl font-bold text-blue-600 mt-1">{metrics.interviews_this_month}</p>
          <p className={`text-xs mt-1 ${ivTrend.up ? "text-green-600" : "text-red-500"}`}>{ivTrend.text}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Applications This Month</p>
          <p className="text-4xl font-bold text-purple-600 mt-1">{metrics.applications_this_month}</p>
          <p className={`text-xs mt-1 ${appTrend.up ? "text-green-600" : "text-red-500"}`}>{appTrend.text}</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-6">Placement Funnel</h2>
        <div className="space-y-3">
          {funnelSteps.map((step) => {
            const width = pct(step.value, funnel.total_seekers);
            return (
              <div key={step.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{step.label}</span>
                  <span className="font-semibold text-gray-900">
                    {step.value.toLocaleString()}
                    {funnel.total_seekers > 0 && (
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        ({pct(step.value, funnel.total_seekers)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-5 rounded-full ${step.color} transition-all`}
                    style={{ width: `${Math.max(width, step.value > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Conversion rates */}
        {funnel.total_seekers > 0 && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Assignment rate</p>
              <p className="text-xl font-bold text-gray-900">{pct(funnel.assigned, funnel.total_seekers)}%</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Applied rate</p>
              <p className="text-xl font-bold text-gray-900">{pct(funnel.applied, funnel.total_seekers)}%</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Interview rate</p>
              <p className="text-xl font-bold text-gray-900">{pct(funnel.interviewed, funnel.total_seekers)}%</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">Placement rate</p>
              <p className="text-xl font-bold text-green-600">{pct(funnel.placed, funnel.total_seekers)}%</p>
            </div>
          </div>
        )}
      </div>

      {/* AM Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Account Manager Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No account managers yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500 w-8">#</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Account Manager</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Seekers</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Placed</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Interviews</th>
                  <th className="text-right py-2 font-medium text-gray-500">Placement %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((am, idx) => (
                  <tr key={am.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4 text-gray-400 font-semibold">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-gray-900">{am.full_name ?? "Unknown"}</span>
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-700">{am.total_seekers}</td>
                    <td className="py-3 pr-4 text-right">
                      <span className={am.placed > 0 ? "text-green-600 font-semibold" : "text-gray-400"}>
                        {am.placed}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-700">{am.interviews}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-green-500"
                            style={{ width: `${am.placement_rate}%` }}
                          />
                        </div>
                        <span className={`font-semibold ${am.placement_rate >= 50 ? "text-green-600" : am.placement_rate >= 25 ? "text-amber-600" : "text-gray-500"}`}>
                          {am.placement_rate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
