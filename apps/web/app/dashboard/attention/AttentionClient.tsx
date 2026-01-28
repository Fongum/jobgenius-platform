"use client";

import { useEffect, useRef, useState } from "react";

type AttentionRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  queue_id: string | null;
  ats_type: string;
  status: string;
  current_step: string;
  last_error: string | null;
  last_error_code: string | null;
  needs_attention_reason: string | null;
  last_seen_url: string | null;
  updated_at: string;
  job_posts:
    | {
        title: string;
        company: string | null;
        location: string | null;
      }
    | Array<{
        title: string;
        company: string | null;
        location: string | null;
      }>
    | null;
  job_seekers:
    | {
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
      }>
    | null;
};

type AttentionClientProps = {
  rows: AttentionRow[];
  amEmail: string;
};

export default function AttentionClient({ rows, amEmail }: AttentionClientProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState(rows.length);
  const lastCountRef = useRef(rows.length);

  useEffect(() => {
    lastCountRef.current = rows.length;
    setAlertCount(rows.length);
  }, [rows.length]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/queue?status=NEEDS_ATTENTION", {
          headers: { "x-am-email": amEmail },
        });
        if (!response.ok) return;
        const data = await response.json();
        const nextCount = data?.items?.length ?? 0;
        if (nextCount > lastCountRef.current) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = 880;
          osc.connect(ctx.destination);
          osc.start();
          setTimeout(() => {
            osc.stop();
            ctx.close();
          }, 200);
        }
        lastCountRef.current = nextCount;
        setAlertCount(nextCount);
      } catch {
        // ignore polling errors
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  async function handleResolve(runId: string) {
    setBusyId(runId);
    try {
      const response = await fetch("/api/apply/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, note: "Resolved in inbox." }),
      });

      if (!response.ok) {
        console.error("Resolve failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  return rows.length === 0 ? (
    <p>No items need attention.</p>
  ) : (
    <>
      <p>
        Attention items: <strong>{alertCount}</strong>
      </p>
      <ul style={{ display: "grid", gap: "12px" }}>
      {rows.map((row) => {
        const post = Array.isArray(row.job_posts)
          ? row.job_posts[0]
          : row.job_posts;
        const seeker = Array.isArray(row.job_seekers)
          ? row.job_seekers[0]
          : row.job_seekers;

        return (
          <li
            key={row.id}
            style={{
              border: "1px solid #e5e7eb",
              padding: "12px",
              borderRadius: "8px",
            }}
          >
            <strong>{post?.title ?? "Untitled"}</strong>
            {post?.company ? ` - ${post.company}` : ""}
            {post?.location ? ` (${post.location})` : ""}
            <div>
              Job seeker: {seeker?.full_name ?? "Unknown"}{" "}
              {seeker?.email ? `(${seeker.email})` : ""}
            </div>
            <div>ATS: {row.ats_type}</div>
            <div>Step: {row.current_step}</div>
            <div>Status: {row.status}</div>
            {row.needs_attention_reason ? (
              <div>Reason: {row.needs_attention_reason}</div>
            ) : row.last_error_code ? (
              <div>Reason: {row.last_error_code}</div>
            ) : null}
            {row.last_error ? <div>Last error: {row.last_error}</div> : null}
            {row.last_seen_url ? <div>Last URL: {row.last_seen_url}</div> : null}
            <div>Updated: {new Date(row.updated_at).toLocaleString()}</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <a href={`/dashboard/jobseekers/${row.job_seeker_id}/queue`}>
                View Queue
              </a>
              <button
                type="button"
                onClick={() => handleResolve(row.id)}
                disabled={busyId === row.id}
              >
                Resolve
              </button>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}
