"use client";

import { useMemo, useState } from "react";

type DraftRow = {
  id: string;
  job_seeker_id: string;
  job_post_id: string;
  subject: string | null;
  body: string | null;
  status: string;
  updated_at: string;
  sent_at: string | null;
  last_error: string | null;
  outreach_contacts:
    | {
        role: string | null;
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        role: string | null;
        full_name: string | null;
        email: string | null;
      }>
    | null;
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

type OutreachClientProps = {
  drafts: DraftRow[];
  amEmail: string;
};

export default function OutreachClient({ drafts, amEmail }: OutreachClientProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [jobSeekerId, setJobSeekerId] = useState("");
  const [jobPostId, setJobPostId] = useState("");

  const editMap = useMemo(() => {
    const map = new Map<string, { subject: string; body: string }>();
    drafts.forEach((draft) => {
      map.set(draft.id, {
        subject: draft.subject ?? "",
        body: draft.body ?? "",
      });
    });
    return map;
  }, [drafts]);

  const [edits, setEdits] = useState(editMap);

  function updateEdit(draftId: string, field: "subject" | "body", value: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(draftId) ?? { subject: "", body: "" };
      next.set(draftId, { ...current, [field]: value });
      return next;
    });
  }

  async function handleSave(draftId: string) {
    setBusyId(draftId);
    try {
      const update = edits.get(draftId);
      const response = await fetch(`/api/outreach/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-am-email": amEmail },
        body: JSON.stringify({
          subject: update?.subject ?? "",
          body: update?.body ?? "",
        }),
      });

      if (!response.ok) {
        console.error("Save failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleSend(draftId: string) {
    setBusyId(draftId);
    try {
      const response = await fetch(`/api/outreach/drafts/${draftId}/send`, {
        method: "POST",
        headers: { "x-am-email": amEmail },
      });

      if (!response.ok) {
        console.error("Send failed.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerate() {
    if (!jobSeekerId.trim() || !jobPostId.trim()) {
      return;
    }
    setBusyId("generate");
    try {
      const response = await fetch("/api/outreach/drafts", {
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
        <strong>Generate drafts</strong>
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
            Generate drafts
          </button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <p>No drafts yet.</p>
      ) : (
        <ul style={{ display: "grid", gap: "12px" }}>
          {drafts.map((draft) => {
            const post = Array.isArray(draft.job_posts)
              ? draft.job_posts[0]
              : draft.job_posts;
            const seeker = Array.isArray(draft.job_seekers)
              ? draft.job_seekers[0]
              : draft.job_seekers;
            const contact = Array.isArray(draft.outreach_contacts)
              ? draft.outreach_contacts[0]
              : draft.outreach_contacts;
            const edit = edits.get(draft.id) ?? {
              subject: draft.subject ?? "",
              body: draft.body ?? "",
            };

            return (
              <li
                key={draft.id}
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
                  Contact: {contact?.role ?? "Contact"}{" "}
                  {contact?.email ? `(${contact.email})` : ""}
                </div>
                <div>Status: {draft.status}</div>
                {draft.sent_at ? (
                  <div>Sent: {new Date(draft.sent_at).toLocaleString()}</div>
                ) : null}
                {draft.last_error ? (
                  <div style={{ color: "#b91c1c" }}>{draft.last_error}</div>
                ) : null}
                <label style={{ display: "block", marginTop: "8px" }}>
                  Subject
                  <input
                    type="text"
                    value={edit.subject}
                    onChange={(event) =>
                      updateEdit(draft.id, "subject", event.target.value)
                    }
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </label>
                <label style={{ display: "block", marginTop: "8px" }}>
                  Body
                  <textarea
                    value={edit.body}
                    onChange={(event) =>
                      updateEdit(draft.id, "body", event.target.value)
                    }
                    rows={6}
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </label>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => handleSave(draft.id)}
                    disabled={busyId === draft.id}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend(draft.id)}
                    disabled={busyId === draft.id}
                  >
                    Send
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
