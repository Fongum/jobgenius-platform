"use client";

import { useState, useMemo } from "react";

interface QueuedApp {
  id: string;
  job_url?: string;
  company_name?: string;
  role_title?: string;
  status: string;
  created_at: string;
}

interface AppRun {
  id: string;
  job_url?: string;
  company_name?: string;
  role_title?: string;
  status: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  RUNNING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
  NEEDS_ATTENTION: "bg-orange-100 text-orange-800",
};

export default function ApplicationsClient({
  initialQueued,
  initialRuns,
}: {
  initialQueued: QueuedApp[];
  initialRuns: AppRun[];
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Combine into a single list
  const allApps = useMemo(() => {
    const items = [
      ...initialQueued.map((q) => ({
        id: q.id,
        company: q.company_name || "Unknown",
        role: q.role_title || "Unknown Role",
        status: q.status,
        date: q.created_at,
        url: q.job_url,
        type: "queued" as const,
      })),
      ...initialRuns.map((r) => ({
        id: r.id,
        company: r.company_name || "Unknown",
        role: r.role_title || "Unknown Role",
        status: r.status,
        date: r.completed_at || r.created_at,
        url: r.job_url,
        type: "run" as const,
        error: r.error_message,
      })),
    ];
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [initialQueued, initialRuns]);

  const filtered = useMemo(() => {
    return allApps.filter((app) => {
      if (filter !== "all" && app.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          app.company.toLowerCase().includes(q) ||
          app.role.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allApps, filter, search]);

  const statuses = useMemo(
    () => Array.from(new Set(allApps.map((a) => a.status))),
    [allApps]
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Applications</h2>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company or role..."
          className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-sm">
        <span className="text-gray-600">
          Showing {filtered.length} of {allApps.length}
        </span>
      </div>

      {/* Application List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No applications found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <div key={`${app.type}-${app.id}`} className="bg-white rounded-lg shadow p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{app.role}</h3>
                  <p className="text-sm text-gray-600">{app.company}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(app.date).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                    STATUS_COLORS[app.status] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {app.status.replace(/_/g, " ")}
                </span>
              </div>
              {"error" in app && app.error && (
                <p className="mt-2 text-sm text-red-600">{app.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
