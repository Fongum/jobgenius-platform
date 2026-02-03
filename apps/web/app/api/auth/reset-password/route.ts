import { initiatePasswordReset, updatePassword } from "@/lib/auth";

type ResetRequestPayload = {
  email: string;
};

type UpdatePasswordPayload = {
  accessToken: string;
  newPassword: string;
};

/**
 * POST /api/auth/reset-password
 *
 * Initiates password reset by sending an email.
 */
export async function POST(request: Request) {
  let payload: ResetRequestPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const { email } = payload;

  if (!email) {
    return Response.json(
      { success: false, error: "Email is required." },
      { status: 400 }
    );
  }

  const result = await initiatePasswordReset(email);

  if (!result.success) {
    // Don't reveal if email exists or not
    return Response.json({ success: true });
  }

  return Response.json({ success: true });
}

/**
 * PUT /api/auth/reset-password
 *
 * Updates password using the reset token.
 * The accessToken is provided after the user clicks the reset link.
 */
export async function PUT(request: Request) {
  let payload: UpdatePasswordPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const { accessToken, newPassword } = payload;

  if (!accessToken || !newPassword) {
    return Response.json(
      { success: false, error: "Access token and new password are required." },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return Response.json(
      { success: false, error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const result = await updatePassword(accessToken, newPassword);

  if (!result.success) {
    return Response.json(
      { success: false, error: result.error ?? "Failed to update password." },
      { status: 400 }
    );
  }

  return Response.json({ success: true });
}
