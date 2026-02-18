import { NextResponse } from "next/server";
import { requireJobSeeker } from "@/lib/auth/middleware";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/portal/gmail/status
 * Returns the seeker's Gmail connection status.
 */
export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = auth.user.id;

  const { data: connection } = await supabaseServer
    .from("seeker_email_connections")
    .select(
      "id, email_address, is_active, last_sync_at, last_error, created_at"
    )
    .eq("job_seeker_id", seekerId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (!connection || !connection.is_active) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: connection.email_address,
    lastSyncAt: connection.last_sync_at,
    lastError: connection.last_error,
    connectedAt: connection.created_at,
  });
}
