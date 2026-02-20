import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import crypto from "crypto";
import { enforceRateLimit } from "@/lib/rate-limit";

const EXTENSION_AUTH_FAILURE = {
  error: "Invalid extension credentials.",
};

/**
 * POST /api/extension/auth
 * Authenticate with AM code and return a session token
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { am_code } = body;
    const normalizedCode =
      typeof am_code === "string" && am_code.trim().length > 0
        ? am_code.trim().toUpperCase()
        : "missing_code";

    const extensionRateLimit = await enforceRateLimit({
      request,
      scope: "extension_auth",
      identifier: normalizedCode,
      limit: Number(process.env.EXTENSION_AUTH_RATE_LIMIT_MAX ?? 8),
      windowSeconds: Number(process.env.EXTENSION_AUTH_RATE_LIMIT_WINDOW_SEC ?? 900),
      blockSeconds: Number(process.env.EXTENSION_AUTH_RATE_LIMIT_BLOCK_SEC ?? 900),
    });

    if (!extensionRateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many authentication attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, extensionRateLimit.retryAfterSeconds)) },
        }
      );
    }

    if (!am_code) {
      return NextResponse.json(
        { error: "AM code is required." },
        { status: 400 }
      );
    }

    // Find account manager by AM code
    const { data: am, error: amError } = await supabaseAdmin
      .from("account_managers")
      .select("id, email, name, role, status, am_code")
      .eq("am_code", am_code.toUpperCase())
      .single();

    if (amError || !am) {
      return NextResponse.json(
        EXTENSION_AUTH_FAILURE,
        { status: 401 }
      );
    }

    // Check if account is approved
    if (am.status !== "approved") {
      return NextResponse.json(
        EXTENSION_AUTH_FAILURE,
        { status: 401 }
      );
    }

    // Generate session token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Create extension session (expires in 30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error: sessionError } = await supabaseAdmin
      .from("extension_sessions")
      .insert({
        account_manager_id: am.id,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        user_agent: request.headers.get("user-agent") || null,
      });

    if (sessionError) {
      console.error("Error creating extension session:", sessionError);
      return NextResponse.json(
        { error: "Failed to create session." },
        { status: 500 }
      );
    }

    // Update last login
    await supabaseAdmin
      .from("account_managers")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", am.id);

    return NextResponse.json({
      token,
      account_manager: {
        id: am.id,
        email: am.email,
        name: am.name,
        am_code: am.am_code,
      },
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Extension auth error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/extension/auth
 * Logout - invalidate the session token
 */
export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No token provided." },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Delete the session
    await supabaseAdmin
      .from("extension_sessions")
      .delete()
      .eq("token_hash", tokenHash);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Extension logout error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
