import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { runJobRefresh } from '@/lib/jobRefreshAgent';

/**
 * POST /api/admin/job-agent/trigger
 *
 * Admin-only manual trigger for the external jobs refresh.
 * Returns the completed RefreshSummary so the UI can display results immediately.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const summary = await runJobRefresh('manual');
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
