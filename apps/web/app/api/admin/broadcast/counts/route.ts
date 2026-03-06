import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { normalizeAMRole } from "@/lib/auth/roles";

// GET /api/admin/broadcast/counts
// Returns active seeker and AM counts for broadcast preview. Superadmin only.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (normalizeAMRole(auth.user.role) !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required." }, { status: 403 });
  }

  const [{ count: seekerCount }, { count: amCount }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseAdmin
      .from("account_managers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  return NextResponse.json({
    job_seekers: seekerCount ?? 0,
    account_managers: amCount ?? 0,
    all_users: (seekerCount ?? 0) + (amCount ?? 0),
  });
}
