"use client";

import { useState } from "react";

type SequenceRow = {
  id: string;
  name: string;
};

type ThreadClientProps = {
  threadId: string;
  amEmail: string;
  sequences: SequenceRow[];
  recruiterStatus: string;
  threadStatus: string;
};

const RECRUITER_STATUSES = ["NEW", "CONTACTED", "ENGAGED", "INTERVIEWING", "CLOSED"] as const;
const THREAD_STATUSES = ["ACTIVE", "WAITING_REPLY", "FOLLOW_UP_DUE", "CLOSED"] as const;

export default function ThreadClient({
  threadId,
  amEmail,
  sequences,
  recruiterStatus,
  threadStatus,
}: ThreadClientProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [sendNow, setSendNow] = useState(false);
  const [busy, setBusy] = useState(false);

  const [stageRecruiterStatus, setStageRecruiterStatus] = useState(
    RECRUITER_STATUSES.includes(recruiterStatus as (typeof RECRUITER_STATUSES)[number])
      ? recruiterStatus
      : "CONTACTED"
  );
  const [stageThreadStatus, setStageThreadStatus] = useState(
    THREAD_STATUSES.includes(threadStatus as (typeof THREAD_STATUSES)[number])
      ? threadStatus
      : "ACTIVE"
  );
  const [closeReason, setCloseReason] = useState("");

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-am-email": amEmail },
        body: JSON.stringify({
          recruiter_thread_id: threadId,
          subject,
          body,
        }),
      });
      if (!response.ok) {
        console.error("Send failed.");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleSchedule() {
    if (!sequenceId) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/outreach/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-am-email": amEmail },
        body: JSON.stringify({
          recruiter_thread_id: threadId,
          sequence_id: sequenceId,
          send_now: sendNow,
        }),
      });
      if (!response.ok) {
        console.error("Schedule failed.");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateStage(options?: { markInterview?: boolean; markOffer?: boolean }) {
    setBusy(true);
    try {
      const response = await fetch(`/api/outreach/threads/${threadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-am-email": amEmail },
        body: JSON.stringify({
          recruiter_status: stageRecruiterStatus,
          thread_status: stageThreadStatus,
          close_reason: closeReason.trim() || null,
          mark_interview: options?.markInterview ?? false,
          mark_offer: options?.markOffer ?? false,
        }),
      });
      if (!response.ok) {
        console.error("Stage update failed.");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleOptOut() {
    setBusy(true);
    try {
      const response = await fetch(`/api/outreach/threads/${threadId}/opt-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-am-email": amEmail },
        body: JSON.stringify({
          reason: closeReason.trim() || "manual_opt_out",
        }),
      });
      if (!response.ok) {
        console.error("Opt-out failed.");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: "1px solid #e5e7eb", padding: "12px", borderRadius: "8px" }}>
      <h3>Compose</h3>
      <label style={{ display: "block", marginTop: "8px" }}>
        Subject
        <input
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          style={{ width: "100%", marginTop: "4px" }}
        />
      </label>
      <label style={{ display: "block", marginTop: "8px" }}>
        Body
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          style={{ width: "100%", marginTop: "4px" }}
        />
      </label>
      <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={handleSend} disabled={busy}>
          Send now
        </button>
      </div>

      <div style={{ marginTop: "16px" }}>
        <strong>Schedule sequence</strong>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select value={sequenceId} onChange={(event) => setSequenceId(event.target.value)}>
            {sequences.map((sequence) => (
              <option key={sequence.id} value={sequence.id}>
                {sequence.name}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(event) => setSendNow(event.target.checked)}
            />{" "}
            Send first step now
          </label>
          <button type="button" onClick={handleSchedule} disabled={busy}>
            Schedule
          </button>
        </div>
      </div>

      <div style={{ marginTop: "16px", display: "grid", gap: "8px" }}>
        <strong>Pipeline stage</strong>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Recruiter status{" "}
            <select
              value={stageRecruiterStatus}
              onChange={(event) => setStageRecruiterStatus(event.target.value)}
            >
              {RECRUITER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Thread status{" "}
            <select
              value={stageThreadStatus}
              onChange={(event) => setStageThreadStatus(event.target.value)}
            >
              {THREAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Close reason
          <input
            type="text"
            value={closeReason}
            onChange={(event) => setCloseReason(event.target.value)}
            placeholder="e.g. OPT_OUT, NOT_A_FIT, OFFER_ACCEPTED"
            style={{ width: "100%", marginTop: "4px" }}
          />
        </label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => handleUpdateStage()} disabled={busy}>
            Update stage
          </button>
          <button
            type="button"
            onClick={() => handleUpdateStage({ markInterview: true })}
            disabled={busy}
          >
            Mark interview
          </button>
          <button
            type="button"
            onClick={() => handleUpdateStage({ markOffer: true })}
            disabled={busy}
          >
            Mark offer
          </button>
          <button type="button" onClick={handleOptOut} disabled={busy}>
            Mark opt-out
          </button>
        </div>
      </div>
    </section>
  );
}
