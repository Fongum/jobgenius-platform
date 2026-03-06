import { NextResponse } from 'next/server';
import { runJobRefresh } from '@/lib/jobRefreshAgent';

/**
 * GET /api/cron/refresh-jobs
 *
 * Vercel Cron endpoint (runs daily at 06:00 UTC).
 * Also callable from GitHub Actions with Authorization: Bearer <CRON_SECRET>.
 *
 * Auth: checked via CRON_SECRET env var. In development (NODE_ENV !== 'production'),
 * requests from localhost are allowed without a secret.
 */
export async function GET(request: Request) {
  // Verify CRON_SECRET (Vercel sets this automatically for cron routes)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    if (!isVercelCron && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Production without a secret configured — block for safety
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 });
  }

  try {
    const summary = await runJobRefresh('vercel-cron');
    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
