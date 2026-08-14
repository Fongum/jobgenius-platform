"use client";

import { useCallback, useEffect, useState } from "react";
import { AWARD_LABELS, formatXaf, isAwardKind } from "@/lib/am-incentives";
import { DIFFICULTY_LABELS, isDifficultyTier } from "@/lib/client-difficulty";

type Placement = {
  id: string;
  amount: number;
  status: string;
  payment_month: string | null;
  payable_from: string | null;
  payability: string;
  difficulty_tier: string | null;
  difficulty_multiplier: number | null;
  commission_basis: number | null;
  bonus_rate: number | null;
  note: string | null;
  created_at: string;
};

type Milestone = {
  id: string;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  client: string | null;
  note: string | null;
  created_at: string;
  paid_at: string | null;
};

type Payload = {
  placements: Placement[];
  milestones: Milestone[];
  totals: { approved: number; paid: number; pending: number };
};

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-50 text-green-700 border-green-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  void: "bg-gray-100 text-gray-500 border-gray-200",
};

function Status({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
        STATUS_STYLES[status] ?? STATUS_STYLES.pending
      }`}
    >
      {status}
    </span>
  );
}

/** Shows the arithmetic, so a bonus can be checked rather than trusted. */
function workingOut(placement: Placement): string | null {
  if (placement.commission_basis === null || placement.bonus_rate === null) {
    return placement.note;
  }
  const pct = Math.round(placement.bonus_rate * 100);
  const multiplier =
    placement.difficulty_multiplier && placement.difficulty_multiplier !== 1
      ? ` × ${placement.difficulty_multiplier}`
      : "";
  return `${pct}% of $${placement.commission_basis.toLocaleString()}${multiplier}`;
}

export default function EarningsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/earnings", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load earnings.");
        return;
      }
      setData(payload as Payload);
      setError(null);
    } catch {
      setError("Network error loading earnings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const placements = data?.placements ?? [];
  const milestones = data?.milestones ?? [];
  const totals = data?.totals;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">My Earnings</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Placement bonuses and interview milestones, with the working out
          behind each. A placement bonus is paid at month end of the month
          your client actually starts the job.
        </p>
      </header>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {totals && (
        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Paid", value: totals.paid, hint: "already in a payslip" },
            { label: "Approved", value: totals.approved, hint: "confirmed, not yet paid" },
            { label: "Pending", value: totals.pending, hint: "awaiting review" },
          ].map((tile) => (
            <div
              key={tile.label}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3"
            >
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {tile.label}
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
                {formatXaf(tile.value)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{tile.hint}</p>
            </div>
          ))}
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Placement bonuses</h2>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 px-5 py-10 text-center">Loading…</p>
        ) : placements.length === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-10 text-center">
            No placement bonuses yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold">Working out</th>
                  <th className="px-3 py-2 text-left font-semibold">Difficulty</th>
                  <th className="px-3 py-2 text-left font-semibold">When</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {placements.map((placement) => (
                  <tr key={placement.id}>
                    <td className="px-4 py-2 font-semibold text-gray-900 tabular-nums">
                      {formatXaf(placement.amount)}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {workingOut(placement) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {isDifficultyTier(placement.difficulty_tier)
                        ? DIFFICULTY_LABELS[placement.difficulty_tier]
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {placement.payability}
                    </td>
                    <td className="px-4 py-2">
                      <Status status={placement.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Milestones</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Paid once per client, the first time an interview actually happens.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 px-5 py-10 text-center">Loading…</p>
        ) : milestones.length === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-10 text-center">
            No milestones yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold">For</th>
                  <th className="px-3 py-2 text-left font-semibold">Client</th>
                  <th className="px-3 py-2 text-left font-semibold">Earned</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {milestones.map((milestone) => (
                  <tr key={milestone.id}>
                    <td className="px-4 py-2 font-semibold text-gray-900 tabular-nums">
                      {formatXaf(milestone.amount)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {isAwardKind(milestone.kind)
                        ? AWARD_LABELS[milestone.kind]
                        : milestone.kind}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {milestone.client ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {new Date(milestone.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <Status status={milestone.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500">
        Every bonus keeps the rate and multiplier it was worked out with, so
        a later change to the rates never alters what you have already been
        paid. The rates in force are at{" "}
        <a href="/dashboard/admin/incentives" className="text-violet-600 underline">
          Incentive Rates
        </a>
        .
      </p>
    </div>
  );
}
