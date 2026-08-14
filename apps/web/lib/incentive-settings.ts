// ============================================================
// Loading and saving the incentive rates (migration 122).
//
// Split from lib/am-incentives.ts, which stays pure so the arithmetic can
// be tested and imported by client components. This module reaches the
// database and must not be imported from anything that runs in a browser.
// ============================================================

import {
  SETTING_KEYS,
  withDefaults,
  type IncentiveSettings,
} from "@/lib/am-incentives";

const COLUMNS = ["id", ...SETTING_KEYS, "updated_by", "updated_at"].join(", ");

/**
 * The rates currently in force.
 *
 * Falls back to the defaults when the row is missing or unreadable —
 * a failed settings read must not stop a bonus being computed, and the
 * defaults are the values the table was seeded with anyway.
 */
export async function loadIncentiveSettings(): Promise<IncentiveSettings> {
  try {
    const { supabaseServer: db } = await import("@/lib/supabase/server");
    const { data } = await db
      .from("incentive_settings")
      .select(COLUMNS)
      .eq("id", true)
      .maybeSingle();

    // Numerics arrive from PostgREST as strings often enough that coercing
    // here is the difference between a rate of 0.1 and a rate of NaN.
    const coerced: Partial<IncentiveSettings> = {};
    for (const key of SETTING_KEYS) {
      const raw = (data as Record<string, unknown> | null)?.[key];
      const value = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(value)) coerced[key] = value;
    }

    return withDefaults(coerced);
  } catch {
    return withDefaults(null);
  }
}

/** The settings plus who last changed them, for the admin screen. */
export async function loadIncentiveSettingsWithMeta(): Promise<{
  settings: IncentiveSettings;
  updated_at: string | null;
  updated_by_name: string | null;
}> {
  const { supabaseServer: db } = await import("@/lib/supabase/server");

  const { data } = await db
    .from("incentive_settings")
    .select(COLUMNS)
    .eq("id", true)
    .maybeSingle();

  const row = (data as Record<string, unknown> | null) ?? null;

  const coerced: Partial<IncentiveSettings> = {};
  for (const key of SETTING_KEYS) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) coerced[key] = value;
  }

  let updatedByName: string | null = null;
  if (row?.updated_by) {
    const { data: manager } = await db
      .from("account_managers")
      .select("name, email")
      .eq("id", row.updated_by as string)
      .maybeSingle();
    const name = typeof manager?.name === "string" ? manager.name.trim() : "";
    const email = typeof manager?.email === "string" ? manager.email.trim() : "";
    updatedByName = name || email || null;
  }

  return {
    settings: withDefaults(coerced),
    updated_at: (row?.updated_at as string | null) ?? null,
    updated_by_name: updatedByName,
  };
}

/**
 * Persist a change. Validation happens in the caller (lib/am-incentives
 * `validateSettings`) so the same rules apply wherever a change comes
 * from; the database CHECK constraints are the backstop.
 */
export async function saveIncentiveSettings(
  changes: Partial<IncentiveSettings>,
  updatedBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabaseServer: db } = await import("@/lib/supabase/server");

  const { error } = await db
    .from("incentive_settings")
    .update({
      ...changes,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) {
    console.error("[incentive-settings:save]", error);
    // 23514 is a CHECK violation — the constraint caught something the
    // application validation did not, which is worth saying plainly.
    return {
      ok: false,
      error:
        error.code === "23514"
          ? "Those values were rejected by the database constraints."
          : "Failed to save the incentive settings.",
    };
  }

  return { ok: true };
}
