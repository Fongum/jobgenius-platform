"use client";

import { useMemo, useState } from "react";

const CONSENT_VERSION = "2026-02-outreach-v1";

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

type JobSeekerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ConsentStatus = Record<
  string,
  Record<string, { accepted_at: string; version: string }>
>;

type OutreachClientProps = {
  drafts: DraftRow[];
  amEmail: string;
  requiredConsents: string[];
  jobSeekers: JobSeekerRow[];
  consentStatus: ConsentStatus;
};

function formatConsentLabel(consentType: string) {
  return consentType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function consentText(consentType: string) {
  if (consentType === "OUTREACH_AUTOMATION") {
    return "I consent to automated outreach messaging for my job search.";
  }
  if (consentType === "OUTREACH_CONTACT_AUTHORIZATION") {
    return "I authorize JobGenius to contact recruiters on my behalf.";
  }
  if (consentType === "OUTREACH_DATA_USAGE") {
    return "I consent to using my profile and application data for recruiter outreach personalization.";
  }
  return `I consent to ${formatConsentLabel(consentType)}.`;
}

function consentHash(consentType: string) {
  const text = consentText(consentType);
  return `${CONSENT_VERSION}:${consentType}:${text.length}`;
}

export default function OutreachClient({
  drafts,
  amEmail,
  requiredConsents,
  jobSeekers,
  consentStatus,
}: OutreachClientProps) {
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [consentBusyKey, setConsentBusyKey] = useState<string | null>(null);
  const [jobSeekerId, setJobSeekerId] = useState("");
  const [jobPostId, setJobPostId] = useState("");
  const [consentState, setConsentState] = useState<ConsentStatus>(consentStatus);

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

  function missingConsentsForSeeker(seekerId: string) {
    const accepted = consentState[seekerId] ?? {};
    return requiredConsents.filter((consentType) => !accepted[consentType]);
  }

  function updateEdit(draftId: string, field: "subject" | "body", value: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(draftId) ?? { subject: "", body: "" };
      next.set(draftId, { ...current, [field]: value });
      return next;
    });
  }

  function markConsentAccepted(jobSeekerIdValue: string, consentType: string) {
    setConsentState((prev) => {
      const seekerState = prev[jobSeekerIdValue] ?? {};
      return {
        ...prev,
        [jobSeekerIdValue]: {
          ...seekerState,
          [consentType]: {
            accepted_at: new Date().toISOString(),
            version: CONSENT_VERSION,
          },
        },
      };
    });
  }

  async function handleAcceptConsent(jobSeekerIdValue: string, consentType: string) {
    const busyKey = `${jobSeekerIdValue}:${consentType}`;
    setConsentBusyKey(busyKey);
    try {
      const response = await fetch("/api/consent/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-am-email": amEmail },
        body: JSON.stringify({
          job_seeker_id: jobSeekerIdValue,
          consent_type: consentType,
          version: CONSENT_VERSION,
          text_hash: consentHash(consentType),
        }),
      });

      if (!response.ok) {
        console.error("Failed to record consent.");
        return;
      }

      markConsentAccepted(jobSeekerIdValue, consentType);
    } finally {
      setConsentBusyKey(null);
    }
  }

  async function handleAcceptAllConsents(jobSeekerIdValue: string) {
    const missing = missingConsentsForSeeker(jobSeekerIdValue);
    if (missing.length === 0) {
      return;
    }

    const busyKey = `${jobSeekerIdValue}:ALL`;
    setConsentBusyKey(busyKey);
    try {
      for (const consentType of missing) {
        const response = await fetch("/api/consent/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-am-email": amEmail },
          body: JSON.stringify({
            job_seeker_id: jobSeekerIdValue,
            consent_type: consentType,
            version: CONSENT_VERSION,
            text_hash: consentHash(consentType),
          }),
        });
        if (!response.ok) {
          console.error("Failed to record one or more consents.");
          return;
        }
        markConsentAccepted(jobSeekerIdValue, consentType);
      }
    } finally {
      setConsentBusyKey(null);
    }
  }

  async function handleSave(draftId: string) {
    setActionBusyId(`save:${draftId}`);
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
      setActionBusyId(null);
    }
  }

  async function handleSend(draftId: string) {
    setActionBusyId(`send:${draftId}`);
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
      setActionBusyId(null);
    }
  }

  async function handleGenerate() {
    if (!jobSeekerId.trim() || !jobPostId.trim()) {
      return;
    }
    setActionBusyId("generate");
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
      setActionBusyId(null);
    }
  }

  return (
    <section style={{ display: "grid", gap: "16px" }}>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
        <h3 style={{ marginTop: 0 }}>Outreach Authorization</h3>
        <p style={{ marginTop: 0 }}>
          Required before automated recruiter outreach.
        </p>
        {jobSeekers.length === 0 ? (
          <p>No assigned job seekers.</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {jobSeekers.map((seeker) => {
              const missing = missingConsentsForSeeker(seeker.id);
              const accepted = consentState[seeker.id] ?? {};

              return (
                <div
                  key={seeker.id}
                  style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}
                >
                  <strong>{seeker.full_name ?? "Job seeker"}</strong>{" "}
                  {seeker.email ? `(${seeker.email})` : ""}
                  <div style={{ marginTop: "8px", display: "grid", gap: "6px" }}>
                    {requiredConsents.map((consentType) => {
                      const entry = accepted[consentType];
                      return (
                        <div
                          key={`${seeker.id}-${consentType}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <span>
                            {formatConsentLabel(consentType)}:{" "}
                            {entry
                              ? `Accepted (${new Date(entry.accepted_at).toLocaleString()})`
                              : "Missing"}
                          </span>
                          {entry ? null : (
                            <button
                              type="button"
                              onClick={() => handleAcceptConsent(seeker.id, consentType)}
                              disabled={consentBusyKey === `${seeker.id}:${consentType}`}
                            >
                              Accept
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
                    {missing.length === 0 ? (
                      <span>Ready for outreach automation.</span>
                    ) : (
                      <>
                        <span>{missing.length} consent(s) missing.</span>
                        <button
                          type="button"
                          onClick={() => handleAcceptAllConsents(seeker.id)}
                          disabled={consentBusyKey === `${seeker.id}:ALL`}
                        >
                          Accept all required
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
          <button type="button" onClick={handleGenerate} disabled={actionBusyId === "generate"}>
            Generate drafts
          </button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <p>No drafts yet.</p>
      ) : (
        <ul style={{ display: "grid", gap: "12px" }}>
          {drafts.map((draft) => {
            const post = Array.isArray(draft.job_posts) ? draft.job_posts[0] : draft.job_posts;
            const seeker = Array.isArray(draft.job_seekers) ? draft.job_seekers[0] : draft.job_seekers;
            const contact = Array.isArray(draft.outreach_contacts)
              ? draft.outreach_contacts[0]
              : draft.outreach_contacts;
            const edit = edits.get(draft.id) ?? {
              subject: draft.subject ?? "",
              body: draft.body ?? "",
            };
            const missingConsents = missingConsentsForSeeker(draft.job_seeker_id);

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
                {draft.sent_at ? <div>Sent: {new Date(draft.sent_at).toLocaleString()}</div> : null}
                {draft.last_error ? <div style={{ color: "#b91c1c" }}>{draft.last_error}</div> : null}
                {missingConsents.length > 0 ? (
                  <div style={{ color: "#b45309", marginTop: "6px" }}>
                    Missing required consent:{" "}
                    {missingConsents.map((consentType) => formatConsentLabel(consentType)).join(", ")}
                  </div>
                ) : null}
                <label style={{ display: "block", marginTop: "8px" }}>
                  Subject
                  <input
                    type="text"
                    value={edit.subject}
                    onChange={(event) => updateEdit(draft.id, "subject", event.target.value)}
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </label>
                <label style={{ display: "block", marginTop: "8px" }}>
                  Body
                  <textarea
                    value={edit.body}
                    onChange={(event) => updateEdit(draft.id, "body", event.target.value)}
                    rows={6}
                    style={{ width: "100%", marginTop: "4px" }}
                  />
                </label>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => handleSave(draft.id)}
                    disabled={actionBusyId === `save:${draft.id}`}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend(draft.id)}
                    disabled={
                      actionBusyId === `send:${draft.id}` || missingConsents.length > 0
                    }
                    title={
                      missingConsents.length > 0
                        ? "Required outreach consents must be accepted first."
                        : undefined
                    }
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
