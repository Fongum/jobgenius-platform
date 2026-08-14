"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_MULTIPLIERS,
  DIFFICULTY_TIERS,
  effectiveTier,
  type DifficultyTier,
} from "@/lib/client-difficulty";

type Assessment = {
  id: string;
  job_seeker_id: string;
  seeker_name: string;
  computed_tier: string;
  computed_score: number;
  signals: { reasons?: string[] } & Record<string, unknown>;
  override_tier: string | null;
  override_reason: string | null;
  override_at: string | null;
  locked_at: string | null;
  created_at: string;
};

type Payload = {
  can_edit: boolean;
  assessments: Assessment[];
};

const TIER_STYLES: Record<DifficultyTier, string> = {
  standard: "bg-gray-100 text-gray-700 border-gray-200",
  hard: "bg-amber-50 text-amber-800 border-amber-200",
  very_hard: "bg-red-50 text-red-800 border-red-200",
};

export default function ClientDifficultyClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/client-difficulty", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load assessments.");
        return;
      }
      setData(payload as Payload);
      setError(null);
    } catch {
      setError("Network error loading assessments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(assessment: Assessment, body: Record<string, unknown>) {
    setBusy(assessment.id);
    setError(null);
    try {
      const res = await fetch("/api/am/client-difficulty", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: assessment.job_seeker_id, ...body }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to update.");
        return;
      }
      await load();
    } catch {
      setError("Network error updating the assessment.");
    } finally {
      setBusy(null);
    }
  }

  async function reassess(assessment: Assessment) {
    setBusy(assessment.id);
    try {
      const res = await fetch("/api/am/client-difficulty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_seeker_id: assessment.job_seeker_id }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to reassess.");
        return;
      }
      await load();
    } catch {
      setError("Network error reassessing.");
    } finally {
      setBusy(null);
    }
  }

  const assessments = data?.assessments ?? [];
  const canEdit = data?.can_edit ?? false;
  const unlocked = assessments.filter((a) => !a.locked_at).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Client Difficulty</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          How hard each client is to place, which sets the placement bonus
          multiplier. Assessed from the live match pool and intake facts,
          then locked.
        </p>
      </header>

      <div className="p-4 rounded-xl text-sm bg-blue-50 text-blue-900 border border-blue-200">
        <p className="font-semibold">Lock the tier before there is an outcome.</p>
        <p className="mt-1">
          A tier assessed after a placement is a justification, not a
          measurement — every placement becomes &ldquo;that was a hard
          one&rdquo;. Locking it while the search is still open is what makes
          the multiplier mean something, and it lets the account manager see
          what the work pays before they do it.
        </p>
        {unlocked > 0 && (
          <p className="mt-2 text-blue-800">
            <strong>{unlocked}</strong> assessment{unlocked === 1 ? "" : "s"} still
            unlocked.
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-500 px-5 py-12 text-center">Loading…</p>
        ) : assessments.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-gray-700 font-medium">No assessments yet.</p>
            <p className="text-sm text-gray-500 mt-1">
              Clients are assessed when they are taken on.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold min-w-[180px]">
                    Client
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Tier</th>
                  <th className="px-3 py-2 text-right font-semibold">Pays</th>
                  <th className="px-3 py-2 text-right font-semibold">Score</th>
                  <th className="px-3 py-2 text-left font-semibold">State</th>
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assessments.map((assessment) => {
                  const tier = effectiveTier(assessment);
                  const open = expanded === assessment.id;
                  const locked = Boolean(assessment.locked_at);
                  return (
                    <Fragment key={assessment.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpanded(open ? null : assessment.id)}
                      >
                        <td className="px-4 py-2 font-medium text-gray-900">
                          <span className="text-gray-400 mr-1.5 inline-block w-3">
                            {open ? "▾" : "▸"}
                          </span>
                          {assessment.seeker_name}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${TIER_STYLES[tier]}`}
                          >
                            {DIFFICULTY_LABELS[tier]}
                          </span>
                          {assessment.override_tier && (
                            <span
                              className="ml-1 text-[10px] text-violet-600"
                              title={assessment.override_reason ?? undefined}
                            >
                              overridden
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                          ×{DIFFICULTY_MULTIPLIERS[tier]}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                          {Number(assessment.computed_score).toFixed(1)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {locked ? (
                            <span className="text-gray-500">Locked</span>
                          ) : (
                            <span className="text-amber-600 font-medium">Open</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-2 text-right">
                            {!locked && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  patch(assessment, { lock: true });
                                }}
                                disabled={busy === assessment.id}
                                className="px-2 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                              >
                                Lock
                              </button>
                            )}
                          </td>
                        )}
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={canEdit ? 6 : 5} className="bg-gray-50 px-5 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div>
                                <p className="text-xs font-semibold uppercase text-gray-500 mb-1">
                                  Why this tier
                                </p>
                                <ul className="space-y-0.5">
                                  {(assessment.signals?.reasons ?? []).map((reason) => (
                                    <li key={reason} className="text-xs text-gray-700">
                                      • {reason}
                                    </li>
                                  ))}
                                </ul>
                                {assessment.override_reason && (
                                  <p className="text-xs text-violet-700 mt-2">
                                    Overridden to{" "}
                                    {DIFFICULTY_LABELS[tier]}: {assessment.override_reason}
                                  </p>
                                )}
                              </div>

                              {canEdit && !locked && (
                                <div>
                                  <p className="text-xs font-semibold uppercase text-gray-500 mb-1">
                                    Override
                                  </p>
                                  <input
                                    type="text"
                                    placeholder="Reason — required"
                                    value={reasons[assessment.id] ?? ""}
                                    onChange={(e) =>
                                      setReasons((prev) => ({
                                        ...prev,
                                        [assessment.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 mb-2"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    {DIFFICULTY_TIERS.map((option) => (
                                      <button
                                        key={option}
                                        onClick={() =>
                                          patch(assessment, {
                                            override_tier: option,
                                            reason: reasons[assessment.id] ?? "",
                                          })
                                        }
                                        disabled={busy === assessment.id}
                                        className="px-2 py-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50"
                                      >
                                        {DIFFICULTY_LABELS[option]} ×
                                        {DIFFICULTY_MULTIPLIERS[option]}
                                      </button>
                                    ))}
                                    {assessment.override_tier && (
                                      <button
                                        onClick={() =>
                                          patch(assessment, { override_tier: null })
                                        }
                                        disabled={busy === assessment.id}
                                        className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                      >
                                        Clear override
                                      </button>
                                    )}
                                    <button
                                      onClick={() => reassess(assessment)}
                                      disabled={busy === assessment.id}
                                      className="px-2 py-1 rounded-lg text-xs text-violet-600 hover:text-violet-800 disabled:opacity-50"
                                    >
                                      Recompute
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
