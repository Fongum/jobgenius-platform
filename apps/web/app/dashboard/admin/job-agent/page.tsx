import { redirect } from 'next/navigation';
import { getCurrentUser, supabaseAdmin } from '@/lib/auth';
import { isAdminRole } from '@/lib/auth/roles';
import JobAgentClient from './JobAgentClient';

type CronRun = {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  triggered_by: string;
  fetched: number;
  inserted: number;
  errors: number;
  source_counts: Record<string, number>;
  error_message: string | null;
};

export default async function JobAgentPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.userType !== 'am' || !isAdminRole(user.role)) redirect('/dashboard');

  const [runsRes, totalJobsRes] = await Promise.all([
    supabaseAdmin
      .from('cron_runs')
      .select(
        'id, started_at, completed_at, status, triggered_by, fetched, inserted, errors, source_counts, error_message'
      )
      .order('started_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('external_jobs')
      .select('id', { count: 'exact', head: true }),
  ]);

  const runs = (runsRes.data ?? []) as unknown as CronRun[];
  const totalJobs = totalJobsRes.count ?? 0;
  const lastRun = runs[0] ?? null;

  return (
    <JobAgentClient
      initialRuns={runs}
      totalJobs={totalJobs}
      lastRun={lastRun}
    />
  );
}
