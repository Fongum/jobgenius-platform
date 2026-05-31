"use client";

import { useState } from "react";
import Link from "next/link";

export interface TimelineRow {
  kind: string;
  at: string;
  title: string;
  body: string | null;
  link: string | null;
  meta: Record<string, unknown> | null;
}

interface NextAction {
  title: string;
  why: string;
  priority: "high" | "medium" | "low";
  suggested_link: string | null;
}

interface NextActionResult {
  summary: string;
  actions: NextAction[];
  aiOutputId: string | null;
}

const KIND_STYLES: Record<string, string> = {
  application_run: "bg-blue-100 text-blue-700",
  outreach_reply: "bg-emerald-100 text-emerald-700",
  outreach_send: "bg-gray-100 text-gray-700",
  interview: "bg-purple-100 text-purple-700",
  job_offer: "bg-pink-100 text-pink-700",
  payment: "bg-amber-100 text-amber-700",
  contract_signed: "bg-indigo-100 text-indigo-700",
  ai_output: "bg-cyan-100 text-cyan-700",
  feedback: "bg-rose-100 text-rose-700",
};

const PRIORITY_STYLES: Record<NextAction["priority"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

const KINDS = [
  "application_run",
  "outreach_reply",
  "outreach_send",
  "interview",
  "job_offer",
  "payment",
  "contract_signed",
  "ai_output",
  "feedback",
];

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function TimelineClient({
  seekerId,
  initialRows,
}: {
  seekerId: string;
  initialRows: TimelineRow[];
}) {
  const [rows] = useState(initialRows);
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<NextActionResult | null>(null);

  const visible = filter === "all" ? rows : rows.filter((r) => r.kind === filter);

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/am/seekers/${seekerId}/next-action`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Suggestion failed.");
        return;
      }
      setSuggestion(data as NextActionResult);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            All
          </button>
          {KINDS.filter((k) => rows.some((r) => r.kind === k)).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                filter === k
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {k.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <button
          onClick={suggest}
          disabled={busy}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Thinking…" : "Suggest next action"}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {suggestion && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2 gap-2">
            <h2 className="text-sm font-semibold text-emerald-900">Next best action</h2>
            <button
              onClick={() => setSuggestion(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
          {suggestion.summary && (
            <p className="text-sm text-emerald-900 mb-3">{suggestion.summary}</p>
          )}
          <div className="space-y-2">
            {suggestion.actions.map((a, i) => (
              <div key={i} className="bg-white border border-emerald-100 rounded-lg p-3">
                <div className="flex items-start gap-2 mb-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      PRIORITY_STYLES[a.priority]
                    }`}
                  >
                    {a.priority}
                  </span>
                  <p className="text-sm font-medium text-gray-900 flex-1">{a.title}</p>
                  {a.suggested_link && (
                    <Link
                      href={a.suggested_link}
                      className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                    >
                      Open →
                    </Link>
                  )}
                </div>
                {a.why && <p className="text-xs text-gray-600 italic">{a.why}</p>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-3">
            Generated suggestion — review and act. Logged to AI Outputs.
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-sm text-gray-400">
          No timeline events match this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                    KIND_STYLES[row.kind] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {row.kind.replace(/_/g, " ")}
                </span>
                <span className="text-[11px] text-gray-400">{fmtDateTime(row.at)}</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{row.title}</p>
                  {row.body && (
                    <p className="text-xs text-gray-600 mt-0.5">{row.body}</p>
                  )}
                </div>
                {row.link && (
                  <Link
                    href={row.link}
                    className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                  >
                    Open →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
