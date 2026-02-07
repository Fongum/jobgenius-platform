/**
 * Shared Extension Authentication Helper
 *
 * Extracts and verifies the extension Bearer token from request headers.
 * Used by all /api/extension/* routes.
 */

import { supabaseAdmin } from "@/lib/auth";
import crypto from "crypto";

export type ExtensionSession = {
  id: string;
  account_manager_id: string;
  active_job_seeker_id: string | null;
  expires_at: string;
};

/**
 * Verify extension Bearer token and return the session.
 *
 * - Reads `Authorization: Bearer <token>` header
 * - Hashes token with SHA256, looks up `extension_sessions`
 * - Validates expiry
 * - Updates `last_active_at`
 * - Returns session or null
 */
export async function verifyExtensionSession(
  request: Request
): Promise<ExtensionSession | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Find valid session
  const { data: session, error } = await supabaseAdmin
    .from("extension_sessions")
    .select("id, account_manager_id, active_job_seeker_id, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !session) {
    return null;
  }

  // Update last active (fire-and-forget)
  supabaseAdmin
    .from("extension_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", session.id)
    .then(() => {});

  return session as ExtensionSession;
}
