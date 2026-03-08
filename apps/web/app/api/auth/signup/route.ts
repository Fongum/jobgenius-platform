import { cookies } from "next/headers";
import { signUp, signIn } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";
import type { UserType } from "@/lib/auth";

const ACCESS_TOKEN_COOKIE = "jg_access_token";
const REFRESH_TOKEN_COOKIE = "jg_refresh_token";
const USER_TYPE_COOKIE = "jg_user_type";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

type SignUpPayload = {
  email: string;
  password: string;
  name?: string;
  userType?: UserType;
  inviteToken?: string;
  referralCode?: string;
};

function isLeadIntakeMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string; details?: string };
  const code = String(row.code ?? "");
  const text = `${row.message ?? ""} ${row.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    text.includes("lead_intake_submissions")
  );
}

/**
 * POST /api/auth/signup
 *
 * Creates a new user account.
 * By default creates account manager accounts.
 * Job seekers are typically pre-created by AMs and just need to set password.
 */
export async function POST(request: Request) {
  let payload: SignUpPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const { email, password, name, userType = "am", inviteToken, referralCode } = payload;

  if (!email || !password) {
    return Response.json(
      { success: false, error: "Email and password are required." },
      { status: 400 }
    );
  }

  // Validate password strength
  if (password.length < 8) {
    return Response.json(
      { success: false, error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return Response.json(
      { success: false, error: "Invalid email format." },
      { status: 400 }
    );
  }

  // Create the user
  const result = await signUp(email, password, userType, { name });

  if (!result.success) {
    return Response.json(
      { success: false, error: result.error ?? "Signup failed." },
      { status: 400 }
    );
  }

  // Auto-login after signup
  const loginResult = await signIn(email, password);

  if (loginResult.success && loginResult.session) {
    const cookieStore = cookies();

    cookieStore.set(ACCESS_TOKEN_COOKIE, loginResult.session.accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60, // 1 hour
    });

    if (loginResult.session.refreshToken) {
      cookieStore.set(REFRESH_TOKEN_COOKIE, loginResult.session.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    cookieStore.set(USER_TYPE_COOKIE, result.user!.userType, {
      ...COOKIE_OPTIONS,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  if (result.user?.userType === "job_seeker") {
    const nowIso = new Date().toISOString();
    try {
      const { data: existingLead, error: existingLeadError } = await supabaseAdmin
        .from("lead_intake_submissions")
        .select("id")
        .ilike("email", email.toLowerCase())
        .limit(1)
        .maybeSingle();

      if (existingLeadError && !isLeadIntakeMissingError(existingLeadError)) {
        console.error("Lead intake lookup failed:", existingLeadError);
      } else if (!existingLead?.id) {
        const { error: insertLeadError } = await supabaseAdmin
          .from("lead_intake_submissions")
          .insert({
            source: "signup",
            status: "new",
            full_name: name?.trim() || null,
            email: email.toLowerCase(),
            phone: null,
            consent_voice: false,
            consent_marketing: false,
            metadata: {
              source_route: "/api/auth/signup",
            },
            created_at: nowIso,
            updated_at: nowIso,
          });

        if (insertLeadError && !isLeadIntakeMissingError(insertLeadError)) {
          console.error("Lead intake insert failed:", insertLeadError);
        }
      }
    } catch (err) {
      if (!isLeadIntakeMissingError(err)) {
        console.error("Lead intake sync on signup failed:", err);
      }
    }
  }

  // Process referral (job_seeker signups only, non-fatal)
  if (result.user?.userType === "job_seeker" && referralCode) {
    try {
      const { getReferrerByCode, createReferral } = await import("@/lib/referrals");
      const referrerId = await getReferrerByCode(referralCode);
      const newSeekerId = result.user.id;
      if (referrerId && referrerId !== newSeekerId) {
        await createReferral(referrerId, newSeekerId);
      }
    } catch (err) {
      console.error("Referral processing error (non-fatal):", err);
    }
  }

  return Response.json({
    success: true,
    user: {
      id: result.user!.id,
      email: result.user!.email,
      name: result.user!.name,
      userType: result.user!.userType,
    },
  });
}
