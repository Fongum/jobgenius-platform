"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PaymentRequest {
  id: string;
  method: string;
  status: string;
  note: string | null;
  created_at: string;
  job_seeker_id: string;
  installment_id: string | null;
  offer_id: string | null;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface Screenshot {
  id: string;
  file_url: string;
  uploaded_at: string;
  acknowledged_at: string | null;
  job_seeker_id: string;
  installment_id: string | null;
  offer_id: string | null;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface Contract {
  id: string;
  plan_type: string;
  registration_fee: number;
  agreed_at: string | null;
  job_seeker_id: string;
  job_seekers: { id: string; full_name: string; email: string; plan_type: string } | null;
}

interface JobOffer {
  id: string;
  company: string;
  role: string;
  base_salary: number;
  status: string;
  commission_status: string;
  commission_amount: number | null;
  commission_due_date: string | null;
  reported_by: string;
  seeker_confirmed_at: string | null;
  am_confirmed_at: string | null;
  job_seeker_id: string;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface Escalation {
  id: string;
  reason: string;
  context_notes: string | null;
  decision: string | null;
  created_at: string;
  job_seeker_id: string;
  job_seekers: { id: string; full_name: string; email: string } | null;
}

interface BillingAdminClientProps {
  paymentRequests: PaymentRequest[];
  screenshots: Screenshot[];
  contracts: Contract[];
  offers: JobOffer[];
  escalations: Escalation[];
}

const TABS = ["Requests", "Screenshots", "Contracts", "Offers", "Escalations"] as const;
type Tab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  details_sent: "bg-purple-100 text-purple-800",
  screenshot_uploaded: "bg-indigo-100 text-indigo-800",
  acknowledged: "bg-green-100 text-green-800",
  reported: "bg-gray-100 text-gray-700",
  confirmed: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  legal: "bg-red-200 text-red-900",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function BillingAdminClient({
  paymentRequests,
  screenshots,
  contracts,
  offers,
  escalations,
}: BillingAdminClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Requests");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const callApi = async (url: string, body: Record<string, unknown>) => {
    setLoading(url);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Action failed.");
        return false;
      }
      refresh();
      return true;
    } catch {
      setError("Network error.");
      return false;
    } finally {
      setLoading(null);
    }
  };

  const pendingRequests = paymentRequests.filter((r) => r.status === "pending");
  const pendingScreenshots = screenshots.filter((s) => !s.acknowledged_at);
  const openEscalations = escalations.filter((e) => !e.decision);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <a
          href="/dashboard/billing/settings"
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Payment Settings
        </a>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</p>
          <p className="text-xs text-gray-500">Pending Requests</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-indigo-600">{pendingScreenshots.length}</p>
          <p className="text-xs text-gray-500">Unreviewed Screenshots</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {offers.filter((o) => o.status !== "accepted").length}
          </p>
          <p className="text-xs text-gray-500">Offers Pending Confirm</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{openEscalations.length}</p>
          <p className="text-xs text-gray-500">Open Escalations</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1">
          {TABS.map((tab) => {
            const badge =
              tab === "Requests" ? pendingRequests.length
              : tab === "Screenshots" ? pendingScreenshots.length
              : tab === "Escalations" ? openEscalations.length
              : 0;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab}
                {badge > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Requests Tab */}
      {activeTab === "Requests" && (
        <div className="space-y-3">
          {paymentRequests.length === 0 && (
            <p className="text-sm text-gray-500">No payment requests.</p>
          )}
          {paymentRequests.map((req) => (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {req.job_seekers?.full_name ?? req.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{req.job_seekers?.email}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Method: <strong className="capitalize">{req.method}</strong>
                    {req.installment_id && " · For installment"}
                    {req.offer_id && " · For commission"}
                  </p>
                  {req.note && <p className="text-xs text-gray-500 mt-1">Note: {req.note}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(req.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={req.status} />
                  {req.status === "pending" && (
                    <button
                      onClick={() =>
                        callApi("/api/admin/billing/payment-details", { paymentRequestId: req.id })
                      }
                      disabled={loading === "/api/admin/billing/payment-details"}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      Send Details
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Screenshots Tab */}
      {activeTab === "Screenshots" && (
        <div className="space-y-3">
          {screenshots.length === 0 && (
            <p className="text-sm text-gray-500">No screenshots uploaded.</p>
          )}
          {screenshots.map((ss) => (
            <div key={ss.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {ss.job_seekers?.full_name ?? ss.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{ss.job_seekers?.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Uploaded: {new Date(ss.uploaded_at).toLocaleString()}
                  </p>
                  {ss.acknowledged_at && (
                    <p className="text-xs text-green-600 mt-0.5">
                      Acknowledged: {new Date(ss.acknowledged_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <a
                    href={ss.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    View
                  </a>
                  {!ss.acknowledged_at && (
                    <button
                      onClick={() =>
                        callApi("/api/admin/billing/acknowledge-payment", { screenshotId: ss.id })
                      }
                      disabled={loading === "/api/admin/billing/acknowledge-payment"}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contracts Tab */}
      {activeTab === "Contracts" && (
        <div className="space-y-3">
          {contracts.length === 0 && (
            <p className="text-sm text-gray-500">No contracts signed yet.</p>
          )}
          {contracts.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {c.job_seekers?.full_name ?? c.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{c.job_seekers?.email}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Plan: <strong className="capitalize">{c.plan_type}</strong> · Fee: ${Number(c.registration_fee).toLocaleString()}
                  </p>
                  {c.agreed_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      Signed: {new Date(c.agreed_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <StatusBadge status={c.agreed_at ? "signed" : "pending"} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Offers Tab */}
      {activeTab === "Offers" && (
        <div className="space-y-3">
          {offers.length === 0 && (
            <p className="text-sm text-gray-500">No job offers reported.</p>
          )}
          {offers.map((offer) => (
            <div key={offer.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {offer.job_seekers?.full_name ?? offer.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{offer.job_seekers?.email}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    {offer.role} at {offer.company} · ${Number(offer.base_salary).toLocaleString()}
                  </p>
                  {offer.commission_amount && (
                    <p className="text-sm text-orange-700 mt-0.5">
                      Commission: ${Number(offer.commission_amount).toLocaleString()}
                      {offer.commission_due_date && ` · Due: ${new Date(offer.commission_due_date).toLocaleDateString()}`}
                    </p>
                  )}
                  <div className="flex gap-2 mt-1 text-xs text-gray-500">
                    <span>Seeker confirmed: {offer.seeker_confirmed_at ? "✓" : "✗"}</span>
                    <span>AM confirmed: {offer.am_confirmed_at ? "✓" : "✗"}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={offer.status} />
                  <StatusBadge status={offer.commission_status} />
                  {offer.status !== "accepted" && (
                    <button
                      onClick={() =>
                        callApi("/api/admin/billing/offer/confirm", { offerId: offer.id })
                      }
                      disabled={loading === "/api/admin/billing/offer/confirm"}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      Confirm Offer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Escalations Tab */}
      {activeTab === "Escalations" && (
        <div className="space-y-3">
          {escalations.length === 0 && (
            <p className="text-sm text-gray-500">No termination escalations.</p>
          )}
          {escalations.map((esc) => (
            <div key={esc.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {esc.job_seekers?.full_name ?? esc.job_seeker_id}
                  </p>
                  <p className="text-sm text-gray-500">{esc.job_seekers?.email}</p>
                  <p className="text-sm text-gray-700 mt-1 capitalize">
                    Reason: <strong>{esc.reason.replace(/_/g, " ")}</strong>
                  </p>
                  {esc.context_notes && (
                    <p className="text-sm text-gray-600 mt-1">{esc.context_notes}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Escalated: {new Date(esc.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {esc.decision ? (
                    <StatusBadge status={esc.decision} />
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          callApi("/api/admin/billing/escalation", {
                            escalationId: esc.id,
                            decision: "cleared",
                          })
                        }
                        disabled={!!loading}
                        className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Terminate ${esc.job_seekers?.full_name ?? "this seeker"}? This will deactivate their account.`)) return;
                          callApi("/api/admin/billing/escalation", {
                            escalationId: esc.id,
                            decision: "terminated",
                          });
                        }}
                        disabled={!!loading}
                        className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        Terminate
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
