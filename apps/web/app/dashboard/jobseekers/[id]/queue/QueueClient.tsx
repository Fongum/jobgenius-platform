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
};

type QueueClientProps = {
  jobSeekerId: string;
  items: QueueItem[];
};

const tabs = [
  "Recommended",
  "Below threshold",
  "Overridden In",
  "Overridden Out",
] as const;

type TabKey = (typeof tabs)[number];

export default function QueueClient({ jobSeekerId, items }: QueueClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("Recommended");
  const [busyId, setBusyId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const recommended = items.filter(
      (item) => item.score >= 60 && item.decision !== "OVERRIDDEN_OUT"
    );
    const below = items.filter(
      (item) => item.score < 60 && item.decision !== "OVERRIDDEN_IN"
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
                Created:{" "}
                {item.created_at
                  ? new Date(item.created_at).toLocaleString()
                  : "—"}
              </div>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
