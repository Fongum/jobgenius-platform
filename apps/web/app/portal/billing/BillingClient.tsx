"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PaymentRequestModal from "./PaymentRequestModal";
import ScreenshotUploadModal from "./ScreenshotUploadModal";
import ReportOfferModal from "./ReportOfferModal";

interface Contract {
  id: string;
  plan_type: string;
  registration_fee: number;
  commission_rate: number;
  agreed_at: string | null;
  contract_html: string | null;
}

interface RegistrationPayment {
  id: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  payment_deadline: string | null;
  work_started: boolean;
}

interface Installment {
  id: string;
  installment_number: number;
  amount: number;
  proposed_date: string;
  status: string;
  paid_at: string | null;
}

interface JobOffer {
  id: string;
  company: string;
  role: string;
  base_salary: number;
  offer_accepted_at: string;
  status: string;
  commission_amount: number | null;
  commission_due_date: string | null;
  commission_status: string;
  seeker_confirmed_at: string | null;
}

interface PaymentRequest {
  id: string;
  method: string;
  status: string;
  installment_id: string | null;
  offer_id: string | null;
  created_at: string;
}

interface BillingClientProps {
  contract: Contract | null;
  registrationPayment: RegistrationPayment | null;
  installments: Installment[];
  offers: JobOffer[];
  paymentRequests: PaymentRequest[];
  seekerId: string;
  userEmail: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  partial: "bg-blue-100 text-blue-800",
  complete: "bg-green-100 text-green-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  legal: "bg-red-200 text-red-900",
  reported: "bg-gray-100 text-gray-700",
  confirmed: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-800",
  details_sent: "bg-purple-100 text-purple-800",
  screenshot_uploaded: "bg-indigo-100 text-indigo-800",
  acknowledged: "bg-green-100 text-green-800",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function BillingClient({
  contract,
  registrationPayment,
  installments,
  offers,
  paymentRequests,
  seekerId,
}: BillingClientProps) {
  const router = useRouter();
  const [showPaymentRequest, setShowPaymentRequest] = useState<{
    installmentId?: string;
    offerId?: string;
    label?: string;
  } | null>(null);
  const [showScreenshotUpload, setShowScreenshotUpload] = useState<{
    installmentId?: string;
    offerId?: string;
    paymentRequestId?: string;
    label?: string;
  } | null>(null);
  const [showReportOffer, setShowReportOffer] = useState(false);
  const [showContract, setShowContract] = useState(false);

  const refresh = () => router.refresh();

  // Find payment request for an installment
  const getRequestForInstallment = (installmentId: string) =>
    paymentRequests.find((r) => r.installment_id === installmentId);

  const getRequestForOffer = (offerId: string) =>
    paymentRequests.find((r) => r.offer_id === offerId);

  if (!contract) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium mb-2">No contract on file</p>
          <p className="text-sm text-amber-700 mb-4">
            Please complete the onboarding process to select a plan and sign your contract.
          </p>
          <a
            href="/portal/onboarding"
            className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Onboarding
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <button
          onClick={() => setShowReportOffer(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
        >
          Report Job Offer
        </button>
      </div>

      {/* Work Started Banner */}
      {registrationPayment && !registrationPayment.work_started && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
          <strong>Services Pending:</strong> Your Account Manager will begin working on your job search once your first payment is confirmed.
        </div>
      )}

      {/* Plan & Contract Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Plan</h2>
          <button
            onClick={() => setShowContract(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            View Contract
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Plan</p>
            <p className="font-semibold text-gray-900 capitalize">{contract.plan_type}</p>
          </div>
          <div>
            <p className="text-gray-500">Registration Fee</p>
            <p className="font-semibold text-gray-900">
              ${Number(contract.registration_fee).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Commission Rate</p>
            <p className="font-semibold text-gray-900">
              {(Number(contract.commission_rate) * 100).toFixed(0)}% of year 1 salary
            </p>
          </div>
          {contract.agreed_at && (
            <div>
              <p className="text-gray-500">Signed</p>
              <p className="font-medium text-gray-900">
                {new Date(contract.agreed_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Registration Payment & Installments */}
      {registrationPayment && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Registration Payment</h2>
            <StatusBadge status={registrationPayment.status} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm mb-5">
            <div>
              <p className="text-gray-500">Total Due</p>
              <p className="font-semibold text-gray-900">${Number(registrationPayment.total_amount).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Paid</p>
              <p className="font-semibold text-green-600">${Number(registrationPayment.amount_paid).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Remaining</p>
              <p className="font-semibold text-gray-900">
                ${(Number(registrationPayment.total_amount) - Number(registrationPayment.amount_paid)).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Installments */}
          <div className="space-y-3">
            {installments.map((inst) => {
              const req = getRequestForInstallment(inst.id);
              return (
                <div key={inst.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Installment {inst.installment_number} — ${Number(inst.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Due: {new Date(inst.proposed_date).toLocaleDateString()}
                      {inst.paid_at && ` · Paid: ${new Date(inst.paid_at).toLocaleDateString()}`}
                    </p>
                    {req && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Payment request: <StatusBadge status={req.status} />
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={inst.status} />
                    {inst.status === "pending" && !req && (
                      <button
                        onClick={() => setShowPaymentRequest({
                          installmentId: inst.id,
                          label: `Installment ${inst.installment_number} ($${Number(inst.amount).toLocaleString()})`,
                        })}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Request Details
                      </button>
                    )}
                    {req && req.status === "details_sent" && (
                      <button
                        onClick={() => setShowScreenshotUpload({
                          installmentId: inst.id,
                          paymentRequestId: req.id,
                          label: `Installment ${inst.installment_number}`,
                        })}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                      >
                        Upload Proof
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Job Offers & Commission */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Job Offers & Commission</h2>
        </div>

        {offers.length === 0 ? (
          <p className="text-sm text-gray-500">No job offers reported yet. Use the &quot;Report Job Offer&quot; button above when you accept an offer.</p>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => {
              const req = getRequestForOffer(offer.id);
              const pendingConfirm = offer.status === "reported" && !offer.seeker_confirmed_at;
              return (
                <div key={offer.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{offer.role}</p>
                      <p className="text-sm text-gray-600">{offer.company}</p>
                    </div>
                    <StatusBadge status={offer.status} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-3">
                    <div>
                      <p className="text-gray-500">Base Salary</p>
                      <p className="font-medium">${Number(offer.base_salary).toLocaleString()}</p>
                    </div>
                    {offer.commission_amount && (
                      <div>
                        <p className="text-gray-500">Commission Due</p>
                        <p className="font-medium text-orange-700">
                          ${Number(offer.commission_amount).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {offer.commission_due_date && (
                      <div>
                        <p className="text-gray-500">Due Date</p>
                        <p className="font-medium">
                          {new Date(offer.commission_due_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                  {offer.commission_amount && (
                    <div className="flex items-center gap-2">
                      <StatusBadge status={offer.commission_status} />
                      {offer.commission_status === "pending" && !req && (
                        <button
                          onClick={() => setShowPaymentRequest({
                            offerId: offer.id,
                            label: `Commission for ${offer.company}`,
                          })}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                          Request Payment Details
                        </button>
                      )}
                      {req && req.status === "details_sent" && (
                        <button
                          onClick={() => setShowScreenshotUpload({
                            offerId: offer.id,
                            paymentRequestId: req.id,
                            label: `Commission — ${offer.company}`,
                          })}
                          className="text-xs px-2 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        >
                          Upload Payment Proof
                        </button>
                      )}
                    </div>
                  )}
                  {pendingConfirm && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      Your Account Manager reported this offer. Please confirm it&apos;s accurate to start the commission clock.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showPaymentRequest && (
        <PaymentRequestModal
          installmentId={showPaymentRequest.installmentId}
          offerId={showPaymentRequest.offerId}
          installmentLabel={showPaymentRequest.label}
          onClose={() => setShowPaymentRequest(null)}
          onSuccess={() => {
            setShowPaymentRequest(null);
            refresh();
          }}
        />
      )}
      {showScreenshotUpload && (
        <ScreenshotUploadModal
          installmentId={showScreenshotUpload.installmentId}
          offerId={showScreenshotUpload.offerId}
          paymentRequestId={showScreenshotUpload.paymentRequestId}
          label={showScreenshotUpload.label}
          onClose={() => setShowScreenshotUpload(null)}
          onSuccess={() => {
            setShowScreenshotUpload(null);
            refresh();
          }}
        />
      )}
      {showReportOffer && (
        <ReportOfferModal
          onClose={() => setShowReportOffer(false)}
          onSuccess={() => {
            setShowReportOffer(false);
            refresh();
          }}
        />
      )}

      {/* Contract viewer modal */}
      {showContract && contract.contract_html && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Client Engagement Agreement</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const w = window.open("", "_blank");
                    if (w) { w.document.write(contract.contract_html!); w.document.close(); w.print(); }
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Print / Save PDF
                </button>
                <button onClick={() => setShowContract(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded ml-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-auto p-4"
              dangerouslySetInnerHTML={{ __html: contract.contract_html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
