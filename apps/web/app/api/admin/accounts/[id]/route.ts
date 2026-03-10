import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/audit";

/**
 * PATCH /api/admin/accounts/[id]
 * Update an account manager (role, name, etc.)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { role, name } = body;

    // Build update object
    const updates: Record<string, unknown> = {};

    if (role !== undefined) {
      const validRoles = ["am", "admin", "superadmin"];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: "Invalid role." },
          { status: 400 }
        );
      }

      // Only superadmins can assign superadmin role
      if (role === "superadmin" && auth.user.role !== "superadmin") {
        return NextResponse.json(
          { error: "Only super admins can assign super admin role." },
          { status: 403 }
        );
      }

      // Get the target account to check current role
      const { data: targetAm } = await supabaseAdmin
        .from("account_managers")
        .select("role")
        .eq("id", id)
        .single();

      if (!targetAm) {
        return NextResponse.json(
          { error: "Account not found." },
          { status: 404 }
        );
      }

      // Prevent demoting a superadmin unless you are also a superadmin
      if (targetAm.role === "superadmin" && auth.user.role !== "superadmin") {
        return NextResponse.json(
          { error: "Only super admins can modify super admin accounts." },
          { status: 403 }
        );
      }

      updates.role = role;
    }

    if (name !== undefined) {
      updates.name = name || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No updates provided." },
        { status: 400 }
      );
    }

    const { data: am, error } = await supabaseAdmin
      .from("account_managers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!am) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    logAdminAction({
      adminId: auth.user.id,
      adminEmail: auth.user.email,
      action: "account.update",
      targetType: "account_manager",
      targetId: id,
      details: { updates },
    }).catch((e) => console.error("Audit log failed", e));

    return NextResponse.json({
      id: am.id,
      email: am.email,
      name: am.name,
      role: am.role,
    });
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/accounts/[id]
 * Get a single account manager
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const { data: am, error } = await supabaseAdmin
      .from("account_managers")
      .select("id, email, name, role, created_at, last_login_at")
      .eq("id", id)
      .single();

    if (error || !am) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(am);
  } catch (error) {
    console.error("Error getting account:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
