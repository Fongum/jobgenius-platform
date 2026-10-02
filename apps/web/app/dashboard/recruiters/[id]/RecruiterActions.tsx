"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OptOut = {
  source: string;
  reason: string | null;
  optedOutAt: string | null;
  /** True only for opt-outs this screen created; the API enforces the same. */
  liftable: boolean;
};

type Props = {
  recruiterId: string;
  viewerId: string;
  isAdmin: boolean;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  doNotContact: boolean;
  optOut: OptOut | null;
  managers: Array<{ id: string; label: string }>;
};

const OPT_OUT_SOURCE_LABEL: Record<string, string> = {
  recruiter_directory: "Marked on this screen",
  am_manual: "Recorded on an outreach thread",
  resend_webhook: "Unsubscribed or bounced",
  webhook: "Unsubscribed or bounced",
};

const NOTES_MAX = 4000;

export default function RecruiterActions(props: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(props.notes ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const blocked = props.doNotContact || props.optOut !== null;
  const notesDirty = notes.trim() !== (props.notes ?? "").trim();

  async function save(action: string, body: Record<string, unknown>, success: string) {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch(`/api/am/recruiters/${props.recruiterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ type: "error", text: data.error ?? "Something went wrong." });
        return;
      }
      setMsg({ type: "success", text: success });
      if (action === "dnc-on") setReason("");
      router.refresh();
    } catch {
      setMsg({ type: "error", text: "Network error — nothing was saved." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {msg && (
        <div
          className={`lg:col-span-3 px-4 py-3 rounded-lg text-sm ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Notes */}
      <section className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={NOTES_MAX}
          rows={6}
          placeholder="What does the team need to know about this recruiter?"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">
            Shared with everyone who can see this recruiter · {notes.length}/{NOTES_MAX}
          </span>
          <button
            onClick={() => save("notes", { notes }, "Notes saved.")}
            disabled={!notesDirty || busy !== null}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 transition"
          >
            {busy === "notes" ? "Saving…" : "Save notes"}
          </button>
        </div>
      </section>

      <div className="space-y-6">
        {/* Owner */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Owner</h2>
          {props.isAdmin ? (
            <select
              value={props.ownerId ?? ""}
              disabled={busy !== null}
              onChange={(e) =>
                save(
                  "owner",
                  { owner_account_manager_id: e.target.value || null },
                  e.target.value ? "Owner updated." : "Owner removed."
                )
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Unowned</option>
              {/* Keep a current owner selectable even if they're no longer an approved AM. */}
              {props.ownerId && !props.managers.some((m) => m.id === props.ownerId) && (
                <option value={props.ownerId}>{props.ownerName ?? "Current owner"}</option>
              )}
              {props.managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.label}
                </option>
              ))}
            </select>
          ) : props.ownerId === props.viewerId ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-violet-700">You own this recruiter</span>
              <button
                onClick={() => save("owner", { owner_account_manager_id: null }, "You no longer own this recruiter.")}
                disabled={busy !== null}
                className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
              >
                Release
              </button>
            </div>
          ) : props.ownerId ? (
            <p className="text-sm text-gray-700">
              {props.ownerName ?? "Another AM"}
              <span className="block text-xs text-gray-400 mt-1">Ask an admin to reassign.</span>
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500">Nobody owns this recruiter.</span>
              <button
                onClick={() =>
                  save("owner", { owner_account_manager_id: props.viewerId }, "You now own this recruiter.")
                }
                disabled={busy !== null}
                className="px-3 py-1.5 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-40 transition"
              >
                Claim
              </button>
            </div>
          )}
        </section>

        {/* Do not contact */}
        <section
          className={`rounded-xl border p-6 ${blocked ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}
        >
          <h2 className="font-semibold text-gray-900 mb-3">Do not contact</h2>
          {blocked ? (
            <div className="space-y-3 text-sm">
              <p className="text-red-800">
                Outreach to this recruiter is blocked for every seeker.
              </p>
              {props.optOut && (
                <dl className="text-xs text-red-900/80 space-y-1">
                  <div>
                    <dt className="inline font-medium">Why: </dt>
                    <dd className="inline">{props.optOut.reason || "No reason recorded"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Source: </dt>
                    <dd className="inline">
                      {OPT_OUT_SOURCE_LABEL[props.optOut.source] ?? props.optOut.source}
                    </dd>
                  </div>
                </dl>
              )}
              {props.optOut && !props.optOut.liftable ? (
                // The recruiter's own decision (or a bounce): not reversible
                // from here by anyone, so don't suggest asking an admin.
                <p className="text-xs text-red-900/70">
                  This opt-out didn&apos;t come from this screen, so it can&apos;t be lifted here.
                </p>
              ) : props.isAdmin ? (
                <button
                  onClick={() => save("dnc-off", { do_not_contact: false }, "Do-not-contact lifted.")}
                  disabled={busy !== null}
                  className="px-3 py-1.5 text-sm text-red-700 border border-red-300 bg-white rounded-lg hover:bg-red-100 disabled:opacity-40 transition"
                >
                  {busy === "dnc-off" ? "Lifting…" : "Lift do-not-contact"}
                </button>
              ) : (
                <p className="text-xs text-red-900/70">Only an admin can lift this.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Stops all outreach to this recruiter, for every seeker.
              </p>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Reason (required)"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <button
                onClick={() =>
                  save(
                    "dnc-on",
                    { do_not_contact: true, do_not_contact_reason: reason },
                    "Marked do-not-contact. Outreach is blocked."
                  )
                }
                disabled={!reason.trim() || busy !== null}
                className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition"
              >
                {busy === "dnc-on" ? "Saving…" : "Mark do not contact"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
