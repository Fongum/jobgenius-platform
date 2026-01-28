"use client";

import { useState } from "react";

type PrepRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  created_at: string;
  updated_at: string;
  job_posts:
    | {
        title: string;
        company: string | null;
      }
    | Array<{
        title: string;
        company: string | null;
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

type InterviewPrepClientProps = {
  items: PrepRow[];
  amEmail: string;
};

export default function InterviewPrepClient({ items, amEmail }: InterviewPrepClientProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [jobSeekerId, setJobSeekerId] = useState("");
  const [jobPostId, setJobPostId] = useState("");

  async function handleGenerate() {
    if (!jobSeekerId.trim() || !jobPostId.trim()) {
      return;
    }

    setBusyId("generate");
    try {
      const response = await fetch("/api/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-am-email": amEmail },
        body: JSON.stringify({
          job_seeker_id: jobSeekerId.trim(),
          job_post_id: jobPostId.trim(),
        }),
      });

      if (!response.ok) {
        console.error("Generate failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div style={{ marginBottom: "16px" }}>
        <strong>Generate interview prep</strong>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <input
            type="text"
            placeholder="Job seeker ID"
            value={jobSeekerId}
            onChange={(event) => setJobSeekerId(event.target.value)}
            style={{ width: "240px" }}
          />
          <input
            type="text"
            placeholder="Job post ID"
            value={jobPostId}
            onChange={(event) => setJobPostId(event.target.value)}
            style={{ width: "240px" }}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busyId === "generate"}
          >
            Generate
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p>No interview prep yet.</p>
      ) : (
        <ul style={{ display: "grid", gap: "12px" }}>
          {items.map((item) => {
            const post = Array.isArray(item.job_posts)
              ? item.job_posts[0]
              : item.job_posts;
            const seeker = Array.isArray(item.job_seekers)
              ? item.job_seekers[0]
              : item.job_seekers;

            return (
              <li
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  padding: "12px",
                  borderRadius: "8px",
                }}
              >
                <strong>{post?.title ?? "Untitled"}</strong>
                {post?.company ? ` - ${post.company}` : ""}
                <div>
                  Job seeker: {seeker?.full_name ?? "Unknown"}{" "}
                  {seeker?.email ? `(${seeker.email})` : ""}
                </div>
                <div>
                  Updated: {new Date(item.updated_at).toLocaleString()}
                </div>
                <a href={`/dashboard/interview-prep/${item.id}`}>
                  View Interview Prep
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
