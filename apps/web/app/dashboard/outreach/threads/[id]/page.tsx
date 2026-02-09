import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import ThreadClient from "./ThreadClient";
import { redirect } from "next/navigation";

type MessageRow = {
  id: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  created_at: string | null;
};

export default async function ThreadPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const threadId = params.id;

  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: thread } = await supabaseServer
    .from("recruiter_threads")
    .select(
      "id, job_seeker_id, thread_status, last_message_direction, last_reply_at, next_follow_up_at, ghosting_risk_score, interview_started_at, offer_received_at, closed_at, close_reason, recruiters (id, name, email, company, status, last_contacted_at), job_seekers (full_name, email)"
    )
    .eq("id", threadId)
    .single();

  if (!thread) {
    return (
      <main>
        <h1>Outreach Thread</h1>
        <p>Thread not found.</p>
      </main>
    );
  }

  const { data: assignments } = await supabaseServer
    .from("job_seeker_assignments")
    .select("id")
    .eq("account_manager_id", user.id)
    .eq("job_seeker_id", thread.job_seeker_id)
    .maybeSingle();

  if (!assignments) {
    return (
      <main>
        <h1>Outreach Thread</h1>
        <p>Not authorized.</p>
      </main>
    );
  }

  const recruiter = Array.isArray(thread.recruiters) ? thread.recruiters[0] : thread.recruiters;
  const seeker = Array.isArray(thread.job_seekers) ? thread.job_seekers[0] : thread.job_seekers;

  const { data: messages } = await supabaseServer
    .from("outreach_messages")
    .select("id, direction, subject, body, status, sent_at, opened_at, replied_at, created_at")
    .eq("recruiter_thread_id", threadId)
    .order("created_at", { ascending: true });

  const { data: sequences } = await supabaseServer
    .from("outreach_sequences")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return (
    <main style={{ display: "grid", gap: "16px" }}>
      <header>
        <h1>Outreach Thread</h1>
        <nav style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
          <a href="/dashboard/outreach/recruiters">Recruiters</a>
          <a href="/dashboard/outreach/follow-ups">Follow-ups Due</a>
          <a href="/dashboard/outreach/conversion">Conversion</a>
          <a href="/dashboard/outreach">Drafts</a>
        </nav>
        <p>
          Recruiter: {recruiter?.name ?? "Unknown"} {recruiter?.email ? `(${recruiter.email})` : ""}
        </p>
        <p>
          Job seeker: {seeker?.full_name ?? "Job seeker"}{" "}
          {seeker?.email ? `(${seeker.email})` : ""}
        </p>
        <p>Status: {thread.thread_status}</p>
      </header>

      <ThreadClient
        threadId={threadId}
        recruiterStatus={recruiter?.status ?? "NEW"}
        threadStatus={thread.thread_status}
        sequences={(sequences ?? []) as Array<{ id: string; name: string }>}
      />

      <section style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
        <h3>Pipeline Milestones</h3>
        <ul style={{ display: "grid", gap: "6px", margin: 0, paddingLeft: "18px" }}>
          <li>
            Next follow-up:{" "}
            {thread.next_follow_up_at
              ? new Date(thread.next_follow_up_at).toLocaleString()
              : "Not scheduled"}
          </li>
          <li>Ghosting risk: {thread.ghosting_risk_score ?? 0}</li>
          <li>
            Interview started:{" "}
            {thread.interview_started_at
              ? new Date(thread.interview_started_at).toLocaleString()
              : "Not recorded"}
          </li>
          <li>
            Offer received:{" "}
            {thread.offer_received_at
              ? new Date(thread.offer_received_at).toLocaleString()
              : "Not recorded"}
          </li>
          <li>
            Closed:{" "}
            {thread.closed_at ? new Date(thread.closed_at).toLocaleString() : "Open"}
          </li>
          <li>Close reason: {thread.close_reason ?? "-"}</li>
        </ul>
      </section>

      <section>
        <h3>Timeline</h3>
        {messages?.length ? (
          <ul style={{ display: "grid", gap: "12px" }}>
            {(messages as MessageRow[]).map((msg) => (
              <li key={msg.id} style={{ border: "1px solid #e5e7eb", padding: "12px", borderRadius: "8px" }}>
                <div>
                  <strong>{msg.direction}</strong> - {msg.status}
                </div>
                {msg.subject ? <div>Subject: {msg.subject}</div> : null}
                {msg.body ? <pre style={{ whiteSpace: "pre-wrap" }}>{msg.body}</pre> : null}
                {msg.sent_at ? <div>Sent: {new Date(msg.sent_at).toLocaleString()}</div> : null}
                {msg.opened_at ? <div>Opened: {new Date(msg.opened_at).toLocaleString()}</div> : null}
                {msg.replied_at ? <div>Replied: {new Date(msg.replied_at).toLocaleString()}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No messages yet.</p>
        )}
      </section>
    </main>
  );
}
