/**
 * Authentication Module
 *
 * Provides authentication utilities for the application.
 *
 * Usage:
 *
 * In API routes:
 * ```ts
 * import { requireAuth, requireAM, requireJobSeekerAccess } from "@/lib/auth";
 *
 * export async function GET(request: Request) {
 *   const auth = await requireAuth(request);
 *   if (!auth.authenticated) {
 *     return Response.json({ error: auth.error }, { status: auth.status });
 *   }
 *   const { user } = auth;
 *   // user.id, user.email, user.userType, user.name, user.role
 * }
 * ```
 *
 * For server components:
 * ```ts
 * import { getCurrentUser } from "@/lib/auth";
 *
 * export default async function Page() {
 *   const user = await getCurrentUser();
 *   if (!user) {
 *     redirect("/login");
 *   }
 * }
 * ```
 */

// Types
export * from "./types";

// Server utilities
export {
  getCurrentUser,
  getUserByAuthId,
  getAccountManagerByEmail,
  getJobSeekerByEmail,
  signUp,
  signIn,
  signOut,
  refreshSession,
  initiatePasswordReset,
  updatePassword,
  hasJobSeekerAccess,
  getAssignedJobSeekers,
  supabaseAdmin,
} from "./server";

// Middleware utilities
export {
  authenticateRequest,
  requireAuth,
  requireAM,
  requireAdmin,
  requireJobSeeker,
  requireJobSeekerAccess,
  type AuthCheckResult,
} from "./middleware";
