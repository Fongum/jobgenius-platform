import { NextResponse } from "next/server";
import { requireAM } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { validateSettings } from "@/lib/am-incentives";
import {
  loadIncentiveSettingsWithMeta,
  saveIncentiveSettings,
} from "@/lib/incentive-settings";

/**
 * GET /api/am/incentive-settings
 *
 * Readable by any AM. Someone whose pay depends on a formula is entitled
 * to know the formula — hiding it invites the belief that it changes
 * quietly. Only admins may write.
 */
export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const payload = await loadIncentiveSettingsWithMeta();
    return NextResponse.json({
      ...payload,
      can_edit: isAdminRole(auth.user.role),
    });
  } catch (error) {
    console.error("[incentive-settings:get]", error);
    return NextResponse.json(
      { error: "Failed to load incentive settings." },
      { status: 500 }
    );
  }
}

/** PUT /api/am/incentive-settings — admins only. */
export async function PUT(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isAdminRole(auth.user.role)) {
    return NextResponse.json(
      { error: "Only an admin can change incentive rates." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validated = validateSettings(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.errors.join(" "), errors: validated.errors },
      { status: 400 }
    );
  }

  if (Object.keys(validated.settings).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const saved = await saveIncentiveSettings(validated.settings, auth.user.id);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  return NextResponse.json(await loadIncentiveSettingsWithMeta());
}
