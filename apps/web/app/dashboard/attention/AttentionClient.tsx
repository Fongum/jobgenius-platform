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
  attention_payload?: Record<string, unknown> | null;
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
};

export default function AttentionClient({ rows }: AttentionClientProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState(rows.length);
  const lastCountRef = useRef(rows.length);
  const [otpValues, setOtpValues] = useState<Record<string, string>>({});

  useEffect(() => {
    lastCountRef.current = rows.length;
    setAlertCount(rows.length);
  }, [rows.length]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/queue?status=NEEDS_ATTENTION", {
          headers: {},
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

  async function handleResolve(runId: string, note?: string) {
    setBusyId(runId);
    try {
      const response = await fetch("/api/apply/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, note: note ?? "Resolved in inbox." }),
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

  async function handleOtpResume(
    runId: string,
    jobSeekerId: string,
    channel: "EMAIL" | "SMS"
  ) {
    const code = otpValues[runId]?.trim();
    if (!code) {
      return;
    }
    setBusyId(runId);
    try {
      const otpResponse = await fetch("/api/otp/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: jobSeekerId,
          channel,
          code,
        }),
      });

      if (!otpResponse.ok) {
        console.error("OTP submit failed.");
        return;
      }

      const resumeResponse = await fetch("/api/apply/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, note: "OTP submitted by AM." }),
      });

      if (!resumeResponse.ok) {
        console.error("Resume failed.");
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
        const reason = row.needs_attention_reason ?? row.last_error_code ?? "";
        const isDryRun = reason === "DRY_RUN_CONFIRM_SUBMIT";
        const isOtpEmail = reason === "OTP_EMAIL" || reason === "OTP_REQUIRED";
        const isOtpSms = reason === "OTP_SMS" || reason === "SMS_OTP";
        const otpChannel = isOtpSms ? "SMS" : "EMAIL";
        const missingFields = Array.isArray(
          (row.attention_payload as Record<string, unknown> | null)?.missing_fields
        )
          ? ((row.attention_payload as Record<string, unknown>).missing_fields as Array<{
              label?: string;
              type?: string;
              options?: string[] | null;
            }>)
          : [];

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
            {reason === "REQUIRED_FIELDS" && missingFields.length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <strong>Missing required fields:</strong>
                <ul>
                  {missingFields.map((field, index) => (
                    <li key={`${row.id}-missing-${index}`}>
                      {field.label ?? "Unknown"}{" "}
                      {field.type ? `(${field.type})` : ""}
                      {field.options && field.options.length > 0
                        ? ` [${field.options.join(", ")}]`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(isOtpEmail || isOtpSms) && (
              <div style={{ marginTop: "8px" }}>
                <label>
                  OTP code{" "}
                  <input
                    type="text"
                    value={otpValues[row.id] ?? ""}
                    onChange={(event) =>
                      setOtpValues((prev) => ({
                        ...prev,
                        [row.id]: event.target.value,
                      }))
                    }
                    placeholder={isOtpSms ? "SMS code" : "Email code"}
                    style={{ marginLeft: "6px" }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    handleOtpResume(row.id, row.job_seeker_id, otpChannel)
                  }
                  disabled={busyId === row.id}
                  style={{ marginLeft: "8px" }}
                >
                  Submit OTP + Resume
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <a href={`/dashboard/jobseekers/${row.job_seeker_id}/queue`}>
                View Queue
              </a>
              <button
                type="button"
                onClick={() =>
                  handleResolve(
                    row.id,
                    isDryRun ? "Dry run confirmed by AM." : undefined
                  )
                }
                disabled={busyId === row.id}
              >
                {isDryRun ? "Resume (real submit)" : "Resolve"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}
