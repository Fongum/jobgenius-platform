import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import {
  RECRUITER_FILTERS,
  RECRUITER_PAGE_SIZE,
  loadRecruiterDirectory,
  parseRecruiterFilter,
  type RecruiterFilter,
} from "@/lib/recruiter-directory";
import { Badge, DoNotContactBadge, StageBadge, formatDate, humanize } from "./ui";

type PageProps = {
  searchParams?: { q?: string; filter?: string; page?: string };
};

function hrefFor(params: { q?: string; filter?: RecruiterFilter; page?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/dashboard/recruiters?${query}` : "/dashboard/recruiters";
}

export default async function RecruitersPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") redirect("/login");

  const isAdmin = isAdminRole(user.role);
  const q = searchParams?.q?.trim() ?? "";
  const filter = parseRecruiterFilter(searchParams?.filter);
  const page = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1);

  const { rows, total, error } = await loadRecruiterDirectory(
    { id: user.id, isAdmin },
    { search: q, filter, page }
  );

  const pageCount = Math.max(1, Math.ceil(total / RECRUITER_PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * RECRUITER_PAGE_SIZE + 1;
  const lastShown = Math.min(total, page * RECRUITER_PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recruiters</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? "Every recruiter, across outreach and hiring-partner requests."
              : "Recruiters you own, have a hiring request assigned from, or are writing to for your seekers."}
          </p>
        </div>
        <form method="get" action="/dashboard/recruiters" className="flex gap-2 w-full sm:w-auto">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, email or company"
            className="flex-1 sm:w-72 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition"
          >
            Search
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {RECRUITER_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={hrefFor({ q, filter: option.key })}
            className={`px-3 py-1.5 text-sm rounded-full border transition ${
              filter === option.key
                ? "bg-violet-600 text-white border-violet-600"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </Link>
        ))}
        <span className="ml-auto text-sm text-gray-500 self-center">
          {total === 0 ? "No recruiters" : `${firstShown}–${lastShown} of ${total}`}
        </span>
      </div>

      {error ? (
        <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          Couldn&apos;t load recruiters: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm rounded-xl border border-dashed border-gray-300">
          {q || filter !== "all"
            ? "No recruiters match this search."
            : "No recruiters yet. They appear here once outreach starts or a hiring partner submits a role."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Recruiter</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Outreach</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Hiring requests</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/recruiters/${row.id}`}
                      className="font-medium text-gray-900 hover:text-violet-700"
                    >
                      {row.name || row.email || "Unnamed recruiter"}
                    </Link>
                    {row.name && (
                      <div className="text-xs text-gray-500 truncate max-w-[16rem]">
                        {row.email ?? "No email"}
                      </div>
                    )}
                    {(row.do_not_contact || row.opted_out) && (
                      <div className="mt-1">
                        <DoNotContactBadge />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div>{row.company ?? "—"}</div>
                    {row.partner_type && (
                      <div className="mt-1">
                        <Badge className="bg-teal-50 text-teal-700">{humanize(row.partner_type)}</Badge>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.visible_thread_count > 0 ? (
                      <div className="flex items-center gap-2">
                        <StageBadge stage={row.best_stage} />
                        <span className="text-xs text-gray-500">
                          {row.visible_thread_count} thread{row.visible_thread_count === 1 ? "" : "s"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                    {row.hidden_thread_count > 0 && (
                      <div className="text-xs text-gray-400 mt-1">
                        +{row.hidden_thread_count} with other AMs&apos; seekers
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.total_request_count > 0 ? (
                      <span>
                        {row.open_request_count} open
                        <span className="text-gray-400"> / {row.total_request_count}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.owner_account_manager_id === user.id ? (
                      <span className="font-medium text-violet-700">You</span>
                    ) : (
                      row.owner_name ?? <span className="text-gray-400">Unowned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(row.last_activity_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          {page > 1 ? (
            <Link href={hrefFor({ q, filter, page: page - 1 })} className="text-violet-700 hover:underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-gray-500">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={hrefFor({ q, filter, page: page + 1 })} className="text-violet-700 hover:underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
