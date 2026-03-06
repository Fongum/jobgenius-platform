'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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

type Props = {
  initialRuns: CronRun[];
  totalJobs: number;
  lastRun: CronRun | null;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    running: 'bg-yellow-100 text-yellow-800',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        styles[status] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {status === 'running' && (
        <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
      )}
      {status}
    </span>
  );
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function JobAgentClient({ initialRuns, totalJobs, lastRun }: Props) {
  const router = useRouter();
  const [runs, setRuns] = useState<CronRun[]>(initialRuns);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [totalJobsCount, setTotalJobsCount] = useState(totalJobs);

  const hasRunningRun = runs.some((r) => r.status === 'running');

  // Auto-refresh every 15s while a run is in progress
  useEffect(() => {
    if (!hasRunningRun) return;
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [hasRunningRun, router]);

  const handleTrigger = useCallback(async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/api/admin/job-agent/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTriggerResult(
          `Done: fetched ${data.fetched}, inserted ${data.inserted}, errors ${data.errors} (${Math.round(data.durationMs / 1000)}s)`
        );
        setTotalJobsCount((prev) => prev + (data.inserted ?? 0));
        // Prepend new run to list
        if (data.runId) {
          const newRun: CronRun = {
            id: data.runId,
            started_at: new Date(Date.now() - data.durationMs).toISOString(),
            completed_at: new Date().toISOString(),
            status: data.status,
            triggered_by: 'manual',
            fetched: data.fetched,
            inserted: data.inserted,
            errors: data.errors,
            source_counts: data.sourceCounts ?? {},
            error_message: data.errorMessage ?? null,
          };
          setRuns((prev) => [newRun, ...prev].slice(0, 20));
        }
      } else {
        setTriggerResult(`Error: ${data.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      setTriggerResult(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTriggering(false);
    }
  }, []);

  const lastRunStatus = lastRun?.status ?? 'never';
  const lastRunTime = lastRun ? formatRelative(lastRun.started_at) : 'Never';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Agent</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Monitors the daily remote job refresh cron (06:00 UTC) and lets you trigger it manually.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {triggerResult && (
            <span className="text-sm text-gray-600 max-w-xs truncate" title={triggerResult}>
              {triggerResult}
            </span>
          )}
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {triggering && (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {triggering ? 'Running…' : 'Trigger Refresh Now'}
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Run</div>
          <div className="mt-1 text-lg font-bold text-gray-900">{lastRunTime}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Status</div>
          <div className="mt-2">
            <StatusBadge status={lastRunStatus} />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total External Jobs</div>
          <div className="mt-1 text-lg font-bold text-indigo-600">{totalJobsCount.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Inserted</div>
          <div className="mt-1 text-lg font-bold text-green-600">
            {lastRun?.inserted?.toLocaleString() ?? '—'}
          </div>
        </div>
      </div>

      {/* Source breakdown for last run */}
      {lastRun && Object.keys(lastRun.source_counts ?? {}).length > 0 && (
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm">
            Last Run — Source Breakdown
          </h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(lastRun.source_counts).map(([source, count]) => (
              <div key={source} className="flex items-center gap-1.5 bg-gray-50 rounded px-3 py-1.5">
                <span className="text-xs font-medium text-gray-500 capitalize">{source}</span>
                <span className="text-sm font-bold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run history table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Run History</h2>
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">No runs yet. Click &ldquo;Trigger Refresh Now&rdquo; to start the first run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Fetched</th>
                  <th className="px-4 py-3 text-right">Inserted</th>
                  <th className="px-4 py-3 text-right">Errors</th>
                  <th className="px-4 py-3 text-left">Triggered By</th>
                  <th className="px-4 py-3 text-left">Sources</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      <span title={run.started_at}>{formatRelative(run.started_at)}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {formatDuration(run.started_at, run.completed_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                      {run.error_message && (
                        <p className="mt-0.5 text-xs text-red-600 max-w-xs truncate" title={run.error_message}>
                          {run.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{run.fetched?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{run.inserted?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-red-600">{run.errors || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                        {run.triggered_by}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(run.source_counts ?? {}).map(([src, cnt]) => (
                          <span
                            key={src}
                            className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs"
                            title={`${src}: ${cnt} jobs`}
                          >
                            {src} {cnt}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
