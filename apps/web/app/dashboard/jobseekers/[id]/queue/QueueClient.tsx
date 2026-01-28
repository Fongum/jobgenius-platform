"use client";

import { useMemo, useState } from "react";

type QueueItem = {
  job_post_id: string;
  title: string;
  company: string | null;
  location: string | null;
  score: number;
  decision: string | null;
  created_at: string | null;
  queue_id: string | null;
  queue_status: string | null;
  last_error: string | null;
  run_id: string | null;
  run_status: string | null;
  current_step: string | null;
  step_attempts: number | null;
  total_attempts: number | null;
  last_error_code: string | null;
  last_seen_url: string | null;
  events: Array<{
    step: string;
    event_type: string;
    message: string | null;
    created_at: string;
  }>;
};

type QueueClientProps = {
  jobSeekerId: string;
  items: QueueItem[];
};

const tabs = [
  "Recommended",
  "Below threshold",
  "Needs Attention",
  "Overridden In",
  "Overridden Out",
] as const;

type TabKey = (typeof tabs)[number];

export default function QueueClient({ jobSeekerId, items }: QueueClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("Recommended");
  const [busyId, setBusyId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const recommended = items.filter(
      (item) =>
        item.score >= 60 &&
        item.decision !== "OVERRIDDEN_OUT" &&
        item.run_status !== "NEEDS_ATTENTION"
    );
    const below = items.filter(
      (item) =>
        item.score < 60 &&
        item.decision !== "OVERRIDDEN_IN" &&
        item.run_status !== "NEEDS_ATTENTION"
    );
    const needsAttention = items.filter(
      (item) => item.run_status === "NEEDS_ATTENTION"
    );
    const overriddenIn = items.filter(
      (item) => item.decision === "OVERRIDDEN_IN"
    );
    const overriddenOut = items.filter(
      (item) => item.decision === "OVERRIDDEN_OUT"
    );

    return {
      Recommended: recommended,
      "Below threshold": below,
      "Needs Attention": needsAttention,
      "Overridden In": overriddenIn,
      "Overridden Out": overriddenOut,
    };
  }, [items]);

  const list = grouped[activeTab];

  async function handleOverride(jobPostId: string, decision: string) {
    setBusyId(jobPostId);
    try {
      const response = await fetch("/api/routing/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: jobSeekerId,
          job_post_id: jobPostId,
          decision,
        }),
      });

      if (!response.ok) {
        console.error("Override failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleEnqueue(jobPostId: string) {
    setBusyId(jobPostId);
    try {
      const response = await fetch("/api/queue/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_seeker_id: jobSeekerId,
          job_post_id: jobPostId,
        }),
      });

      if (!response.ok) {
        console.error("Enqueue failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleStart(queueId: string) {
    setBusyId(queueId);
    try {
      const response = await fetch("/api/apply/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_id: queueId }),
      });

      if (!response.ok) {
        console.error("Start failed.");
        return;
      }

      const data = await response.json();
      if (data.blocked) {
        console.error("Blocked:", data.reason);
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleResume(runId: string) {
    setBusyId(runId);
    try {
      const response = await fetch("/api/apply/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId }),
      });

      if (!response.ok) {
        console.error("Resume failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleMark(runId: string, status: "FAILED" | "CANCELLED") {
    setBusyId(runId);
    try {
      const response = await fetch("/api/apply/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, status }),
      });

      if (!response.ok) {
        console.error("Mark failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {tab} ({grouped[tab].length})
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p>No jobs in this category.</p>
      ) : (
        <ul style={{ display: "grid", gap: "12px" }}>
          {list.map((item) => (
            <li
              key={item.job_post_id}
              style={{
                border: "1px solid #e5e7eb",
                padding: "12px",
                borderRadius: "8px",
              }}
            >
              <strong>{item.title}</strong>
              {item.company ? ` - ${item.company}` : ""}
              {item.location ? ` (${item.location})` : ""}
              <div>Score: {item.score}</div>
              <div>Decision: {item.decision ?? "NONE"}</div>
              <div>
                Status: {item.run_status ?? item.queue_status ?? "NOT_QUEUED"}
              </div>
              <div>Step: {item.current_step ?? "N/A"}</div>
              <div>
                Attempts: {item.step_attempts ?? 0} step /{" "}
                {item.total_attempts ?? 0} total
              </div>
              {item.last_error_code ? (
                <div style={{ color: "#b91c1c" }}>
                  Error code: {item.last_error_code}
                </div>
              ) : null}
              {item.last_seen_url ? (
                <div>Last URL: {item.last_seen_url}</div>
              ) : null}
              <div>
                Created:{" "}
                {item.created_at
                  ? new Date(item.created_at).toLocaleString()
                  : "-"}
              </div>
              {item.last_error ? (
                <div style={{ color: "#b91c1c" }}>
                  Last error: {item.last_error}
                </div>
              ) : null}
              {item.events.length > 0 ? (
                <div>
                  Recent events:
                  <ul>
                    {item.events.map((event) => (
                      <li key={`${item.job_post_id}-${event.created_at}`}>
                        {event.event_type} {event.step}{" "}
                        {event.message ? `- ${event.message}` : ""} (
                        {new Date(event.created_at).toLocaleString()})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() =>
                    handleOverride(item.job_post_id, "OVERRIDDEN_IN")
                  }
                  disabled={busyId === item.job_post_id}
                >
                  Override In
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleOverride(item.job_post_id, "OVERRIDDEN_OUT")
                  }
                  disabled={busyId === item.job_post_id}
                >
                  Override Out
                </button>
                <button
                  type="button"
                  onClick={() => handleEnqueue(item.job_post_id)}
                  disabled={busyId === item.job_post_id}
                >
                  Enqueue Application
                </button>
                {item.queue_id ? (
                  <button
                    type="button"
                    onClick={() => handleStart(item.queue_id as string)}
                    disabled={busyId === item.queue_id}
                  >
                    Start
                  </button>
                ) : null}
                {item.run_id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleResume(item.run_id as string)}
                      disabled={busyId === item.run_id}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMark(item.run_id as string, "FAILED")}
                      disabled={busyId === item.run_id}
                    >
                      Mark Failed
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleMark(item.run_id as string, "CANCELLED")
                      }
                      disabled={busyId === item.run_id}
                    >
                      Dismiss
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
