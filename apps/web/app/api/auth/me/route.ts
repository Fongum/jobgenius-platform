import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json(
      { success: false, error: "Not authenticated." },
      { status: 401 }
    );
  }

  return Response.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      userType: user.userType,
      role: user.role,
    },
  });
}
