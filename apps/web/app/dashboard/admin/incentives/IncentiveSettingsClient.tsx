"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_INCENTIVE_SETTINGS,
  SETTING_BOUNDS,
  SETTING_KEYS,
  computePlacementBonus,
  explainPlacementBonus,
  formatXaf,
  type IncentiveSettings,
} from "@/lib/am-incentives";
import { DIFFICULTY_LABELS, DIFFICULTY_TIERS } from "@/lib/client-difficulty";

type Payload = {
  settings: IncentiveSettings;
  updated_at: string | null;
  updated_by_name: string | null;
  can_edit: boolean;
};

/** A commission to preview against — $50k at 2.5% is the typical case. */
const PREVIEW_COMMISSIONS = [500, 1_250, 2_500, 5_000];

const HELP: Record<keyof IncentiveSettings, string> = {
  placement_bonus_rate:
    "Share of the placement commission paid to the account manager. Enter 0.10 for 10%.",
  placement_bonus_floor:
    "No placement pays less than this, so a modest-salary client is never a pay cut.",
  placement_bonus_cap:
    "No single placement pays more than this, so one exceptional month cannot distort payroll.",
  first_interview_award:
    "Paid once per client, the first time an interview actually happens.",
  usd_to_xaf: "Applied to commissions earned in USD before the bonus is worked out.",
};

export default function IncentiveSettingsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/am/incentive-settings", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to load incentive settings.");
        return;
      }
      setData(payload as Payload);
      const next: Record<string, string> = {};
      for (const key of SETTING_KEYS) {
        next[key] = String((payload as Payload).settings[key]);
      }
      setDraft(next);
      setError(null);
    } catch {
      setError("Network error loading incentive settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** The settings as currently typed, for the live preview. */
  const previewSettings = useMemo<IncentiveSettings>(() => {
    const merged = { ...(data?.settings ?? DEFAULT_INCENTIVE_SETTINGS) };
    for (const key of SETTING_KEYS) {
      const value = Number(draft[key]);
      if (Number.isFinite(value)) merged[key] = value;
    }
    return merged;
  }, [data, draft]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return SETTING_KEYS.some(
      (key) => Number(draft[key]) !== Number(data.settings[key])
    );
  }, [data, draft]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, number> = {};
      for (const key of SETTING_KEYS) {
        const value = Number(draft[key]);
        if (Number.isFinite(value)) body[key] = value;
      }

      const res = await fetch("/api/am/incentive-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Failed to save.");
        return;
      }
      setData(payload as Payload);
      setSaved(true);
    } catch {
      setError("Network error saving incentive settings.");
    } finally {
      setSaving(false);
    }
  }

  const canEdit = data?.can_edit ?? false;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Incentive Rates</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          What an account manager earns for a placement and for getting a
          client to interview. Changing a rate here affects future
          calculations only — every bonus already recorded keeps the rate it
          was worked out with.
        </p>
        {data?.updated_at && (
          <p className="text-xs text-gray-400 mt-1">
            Last changed {new Date(data.updated_at).toLocaleString()}
            {data.updated_by_name && ` by ${data.updated_by_name}`}
          </p>
        )}
      </header>

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}
      {saved && !dirty && (
        <div className="p-3 rounded-lg text-sm bg-green-50 text-green-800 border border-green-200">
          Saved. New placements will use these rates.
        </div>
      )}
      {!canEdit && !loading && (
        <div className="p-3 rounded-lg text-sm bg-gray-50 text-gray-700 border border-gray-200">
          These are the rates your bonuses are calculated with. Only an admin
          can change them.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 py-12 text-center">Loading…</p>
      ) : (
        <>
          <section className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {SETTING_KEYS.map((key) => {
              const bounds = SETTING_BOUNDS[key];
              return (
                <div
                  key={key}
                  className="px-5 py-4 flex flex-wrap items-start justify-between gap-4"
                >
                  <div className="max-w-md">
                    <label
                      htmlFor={key}
                      className="block text-sm font-medium text-gray-900"
                    >
                      {bounds.label}
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">{HELP[key]}</p>
                  </div>
                  <div className="text-right">
                    <input
                      id={key}
                      type="number"
                      step={bounds.isRate ? "0.01" : "100"}
                      min={bounds.min}
                      max={bounds.max}
                      disabled={!canEdit}
                      value={draft[key] ?? ""}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 text-right tabular-nums disabled:bg-gray-50 disabled:text-gray-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      {bounds.isRate
                        ? `${(Number(draft[key]) * 100 || 0).toFixed(1)}%`
                        : `${bounds.min.toLocaleString()}–${bounds.max.toLocaleString()}`}
                    </p>
                  </div>
                </div>
              );
            })}

            {canEdit && (
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    const next: Record<string, string> = {};
                    for (const key of SETTING_KEYS) {
                      next[key] = String(DEFAULT_INCENTIVE_SETTINGS[key]);
                    }
                    setDraft(next);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Reset to proposed defaults
                </button>
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : dirty ? "Save rates" : "No changes"}
                </button>
              </div>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                What that pays {dirty && <span className="text-violet-600">(unsaved)</span>}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Bonus per placement at each difficulty tier, by the commission
                collected.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Commission</th>
                    {DIFFICULTY_TIERS.map((tier) => (
                      <th key={tier} className="px-4 py-2 text-right font-semibold">
                        {DIFFICULTY_LABELS[tier]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {PREVIEW_COMMISSIONS.map((commission) => (
                    <tr key={commission}>
                      <td className="px-4 py-2 text-gray-700 tabular-nums">
                        ${commission.toLocaleString()}
                      </td>
                      {DIFFICULTY_TIERS.map((tier) => {
                        const bonus = computePlacementBonus(
                          { commissionAmount: commission, tier },
                          previewSettings
                        );
                        return (
                          <td
                            key={tier}
                            className="px-4 py-2 text-right tabular-nums text-gray-900"
                            title={explainPlacementBonus(bonus, commission)}
                          >
                            {formatXaf(bonus.total)}
                            {(bonus.flooredAtMinimum || bonus.cappedAtMaximum) && (
                              <span className="ml-1 text-[10px] text-amber-600">
                                {bonus.flooredAtMinimum ? "min" : "max"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-200">
              Cells marked <span className="text-amber-600">min</span> or{" "}
              <span className="text-amber-600">max</span> hit a bound rather
              than the percentage — if most of the table is marked, the bounds
              are doing the work and the rate is not.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
