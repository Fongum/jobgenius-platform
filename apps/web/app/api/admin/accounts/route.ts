import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";

/**
 * POST /api/admin/accounts
 * Create a new account manager account
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { email, password, name, role } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["am", "admin", "superadmin"];
    const targetRole = role || "am";
    if (!validRoles.includes(targetRole)) {
      return NextResponse.json(
        { error: "Invalid role." },
        { status: 400 }
      );
    }

    // Only superadmins can create superadmins
    if (targetRole === "superadmin" && auth.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Only super admins can create super admin accounts." },
        { status: 403 }
      );
    }

    // Check if email already exists
    const { data: existing } = await supabaseAdmin
      .from("account_managers")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        user_type: "am",
        name,
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Failed to create auth user." },
        { status: 500 }
      );
    }

    // Create account manager record (auto-approved when created by admin)
    const { data: am, error: amError } = await supabaseAdmin
      .from("account_managers")
      .insert({
        email,
        name: name || null,
        auth_id: authData.user.id,
        role: targetRole,
        status: "approved", // Auto-approve accounts created by admins
      })
      .select()
      .single();

    if (amError || !am) {
      // Rollback auth user if AM creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: amError?.message || "Failed to create account manager." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: am.id,
      email: am.email,
      name: am.name,
      role: am.role,
    });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/accounts
 * List all account managers
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { data: accountManagers, error } = await supabaseAdmin
      .from("account_managers")
      .select("id, email, name, role, created_at, last_login_at")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(accountManagers || []);
  } catch (error) {
    console.error("Error listing accounts:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
