"use client";

import { useEffect, useMemo, useState } from "react";

interface Installment {
  amount: string;
  proposedDate: string;
}

interface RegistrationFlexRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  requested_installment_count: number | null;
  requested_window_days: number | null;
  requested_note: string;
  approved_max_installments: number | null;
  approved_window_days: number | null;
  admin_note: string | null;
  reviewed_at: string | null;
}

interface InstallmentPlanStepProps {
  planType: "essentials" | "premium";
  onContinue: () => void;
  onBack: () => void;
}

const DEFAULT_MAX_INSTALLMENTS = 3;
const DEFAULT_WINDOW_DAYS = 31;
const MAX_FLEX_INSTALLMENTS = 12;
const MAX_FLEX_WINDOW_DAYS = 365;

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function plusDays(base: Date, days: number) {
  const out = new Date(base);
  out.setDate(out.getDate() + days);
  return out;
}

function formatDateInput(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatCurrency(val: number) {
  return val.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function InstallmentPlanStep({
  planType,
  onContinue,
  onBack,
}: InstallmentPlanStepProps) {
  const totalFee = planType === "premium" ? 1000 : 500;
  const today = useMemo(() => startOfToday(), []);

  const [count, setCount] = useState<number>(1);
  const [installments, setInstallments] = useState<Installment[]>([
    { amount: String(totalFee), proposedDate: formatDateInput(today) },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flexLoading, setFlexLoading] = useState(true);
  const [flexRequest, setFlexRequest] = useState<RegistrationFlexRequest | null>(
    null
  );
  const [maxInstallments, setMaxInstallments] = useState(
    DEFAULT_MAX_INSTALLMENTS
  );
  const [paymentWindowDays, setPaymentWindowDays] = useState(DEFAULT_WINDOW_DAYS);

  const [flexRequestedCount, setFlexRequestedCount] = useState(4);
  const [flexRequestedWindowDays, setFlexRequestedWindowDays] = useState(60);
  const [flexRequestNote, setFlexRequestNote] = useState("");
  const [flexRequestSaving, setFlexRequestSaving] = useState(false);
  const [flexRequestError, setFlexRequestError] = useState<string | null>(null);
  const [flexRequestSuccess, setFlexRequestSuccess] = useState<string | null>(
    null
  );

  const maxDate = useMemo(
    () => plusDays(today, paymentWindowDays),
    [today, paymentWindowDays]
  );

  const installmentOptions = useMemo(
    () => Array.from({ length: maxInstallments }, (_, index) => index + 1),
    [maxInstallments]
  );

  useEffect(() => {
    let cancelled = false;

    const loadFlexRequest = async () => {
      setFlexLoading(true);
      try {
        const res = await fetch("/api/portal/billing/registration-flex", {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        const latest = (data?.request ?? null) as RegistrationFlexRequest | null;
        if (cancelled) return;

        setFlexRequest(latest);
        if (latest?.status === "approved") {
          setMaxInstallments(
            latest.approved_max_installments ?? DEFAULT_MAX_INSTALLMENTS
          );
          setPaymentWindowDays(
            latest.approved_window_days ?? DEFAULT_WINDOW_DAYS
          );
        } else {
          setMaxInstallments(DEFAULT_MAX_INSTALLMENTS);
          setPaymentWindowDays(DEFAULT_WINDOW_DAYS);
        }
      } catch {
        // No-op: onboarding should still work with default terms.
      } finally {
        if (!cancelled) {
          setFlexLoading(false);
        }
      }
    };

    loadFlexRequest();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (count > maxInstallments) {
      setCount(maxInstallments);
    }
  }, [count, maxInstallments]);

  useEffect(() => {
    const base = Math.floor(totalFee / count);
    const remainder = totalFee - base * count;
    const intervalDays =
      count <= 1 ? 0 : Math.max(1, Math.floor(paymentWindowDays / (count - 1)));

    const nextInstallments: Installment[] = Array.from({ length: count }, (_, i) => {
      const dueDate = plusDays(today, intervalDays * i);
      return {
        amount: i === count - 1 ? String(base + remainder) : String(base),
        proposedDate: formatDateInput(dueDate),
      };
    });

    setInstallments(nextInstallments);
  }, [count, paymentWindowDays, today, totalFee]);

  const updateInstallment = (
    index: number,
    field: keyof Installment,
    value: string
  ) => {
    setInstallments((prev) =>
      prev.map((inst, i) => (i === index ? { ...inst, [field]: value } : inst))
    );
  };

  const totalEntered = installments.reduce(
    (sum, inst) => sum + (parseFloat(inst.amount) || 0),
    0
  );
  const totalMatch = Math.abs(totalEntered - totalFee) < 0.01;

  const allDatesValid = installments.every((inst) => {
    if (!inst.proposedDate) return false;
    const d = new Date(inst.proposedDate);
    return d >= today && d <= maxDate;
  });

  const canSubmit =
    totalMatch &&
    allDatesValid &&
    installments.every((inst) => inst.amount && parseFloat(inst.amount) > 0);

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/billing/installments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          installments: installments.map((inst) => ({
            amount: parseFloat(inst.amount),
            proposedDate: inst.proposedDate,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save installment plan. Please try again.");
        return;
      }

      onContinue();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const submitFlexRequest = async () => {
    const note = flexRequestNote.trim();
    if (note.length < 15) {
      setFlexRequestError("Please include at least 15 characters for your reason.");
      return;
    }

    setFlexRequestSaving(true);
    setFlexRequestError(null);
    setFlexRequestSuccess(null);
    try {
      const res = await fetch("/api/portal/billing/registration-flex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_installment_count: flexRequestedCount,
          requested_window_days: flexRequestedWindowDays,
          requested_note: note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlexRequestError(
          data.error || "Failed to submit flexible registration request."
        );
        return;
      }

      setFlexRequest(data.request ?? null);
      setFlexRequestSuccess(
        "Flexible registration request submitted. An admin will review it."
      );
      setFlexRequestNote("");
    } catch {
      setFlexRequestError("Network error while submitting request.");
    } finally {
      setFlexRequestSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Payment Schedule</h2>
        <p className="text-gray-600 mt-1 text-sm">
          Your registration fee is <strong>{formatCurrency(totalFee)}</strong>.
          Choose how you want to pay. Your current limit is up to{" "}
          <strong>{maxInstallments}</strong> installments within{" "}
          <strong>{paymentWindowDays}</strong> days from today (
          {maxDate.toLocaleDateString("en-US")}).
        </p>
      </div>

      {flexLoading && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          Loading flexible registration status...
        </div>
      )}

      {!flexLoading && flexRequest?.status === "pending" && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Your flexible registration request is pending admin review. You can
          continue with standard terms now, or wait for approval.
        </div>
      )}

      {!flexLoading && flexRequest?.status === "approved" && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          Flexible registration approved: up to{" "}
          <strong>{flexRequest.approved_max_installments ?? maxInstallments}</strong>{" "}
          installments within{" "}
          <strong>{flexRequest.approved_window_days ?? paymentWindowDays}</strong>{" "}
          days.
          {flexRequest.admin_note ? ` Admin note: ${flexRequest.admin_note}` : ""}
        </div>
      )}

      {!flexLoading && flexRequest?.status === "rejected" && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Your last flexible registration request was not approved.
          {flexRequest.admin_note ? ` Admin note: ${flexRequest.admin_note}` : ""}
        </div>
      )}

      {!flexLoading && flexRequest?.status !== "approved" && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-blue-900">
            Need a more flexible registration payment plan?
          </h3>
          <p className="text-xs text-blue-800 mt-1">
            Request admin approval for more installments and/or a longer payment
            window. This only affects registration billing.
          </p>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-blue-900 mb-1">
                Requested installments
              </label>
              <input
                type="number"
                min={1}
                max={MAX_FLEX_INSTALLMENTS}
                value={flexRequestedCount}
                onChange={(event) =>
                  setFlexRequestedCount(
                    Math.max(1, Math.min(MAX_FLEX_INSTALLMENTS, Number(event.target.value) || 1))
                  )
                }
                className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-900 mb-1">
                Requested window (days)
              </label>
              <input
                type="number"
                min={7}
                max={MAX_FLEX_WINDOW_DAYS}
                value={flexRequestedWindowDays}
                onChange={(event) =>
                  setFlexRequestedWindowDays(
                    Math.max(7, Math.min(MAX_FLEX_WINDOW_DAYS, Number(event.target.value) || 7))
                  )
                }
                className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-semibold text-blue-900 mb-1">
              Why do you need this flexibility?
            </label>
            <textarea
              rows={3}
              value={flexRequestNote}
              onChange={(event) => setFlexRequestNote(event.target.value)}
              placeholder="Explain your situation so admins can review your request."
              className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 resize-none"
            />
          </div>

          {flexRequestError && (
            <p className="mt-2 text-xs text-red-700">{flexRequestError}</p>
          )}
          {flexRequestSuccess && (
            <p className="mt-2 text-xs text-green-700">{flexRequestSuccess}</p>
          )}

          <button
            type="button"
            onClick={submitFlexRequest}
            disabled={flexRequestSaving}
            className="mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {flexRequestSaving ? "Submitting..." : "Request Flexible Terms"}
          </button>
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-800 mb-2">
          Number of installments
        </label>
        <select
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="w-full border border-gray-400 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {installmentOptions.map((value) => (
            <option key={value} value={value}>
              {value} {value === 1 ? "Payment" : "Payments"}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 mb-4">
        {installments.map((inst, index) => {
          const dateObj = inst.proposedDate ? new Date(inst.proposedDate) : null;
          const dateInvalid = dateObj ? dateObj < today || dateObj > maxDate : true;

          return (
            <div
              key={index}
              className="bg-gray-50 rounded-lg p-4 border border-gray-200"
            >
              <p className="text-sm font-semibold text-gray-800 mb-3">
                Installment {index + 1}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={inst.amount}
                    onChange={(event) =>
                      updateInstallment(index, "amount", event.target.value)
                    }
                    className="w-full border border-gray-400 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Proposed Date
                  </label>
                  <input
                    type="date"
                    value={inst.proposedDate}
                    min={formatDateInput(today)}
                    max={formatDateInput(maxDate)}
                    onChange={(event) =>
                      updateInstallment(index, "proposedDate", event.target.value)
                    }
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      dateInvalid
                        ? "border-red-400 bg-red-50 text-gray-900"
                        : "border-gray-400 bg-white text-gray-900"
                    }`}
                  />
                  {dateInvalid && (
                    <p className="text-xs text-red-500 mt-1">
                      Must be within {paymentWindowDays} days
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`rounded-lg p-3 mb-4 text-sm flex items-center justify-between ${
          totalMatch
            ? "bg-green-50 border border-green-200 text-green-800"
            : "bg-red-50 border border-red-200 text-red-800"
        }`}
      >
        <span>
          Total: <strong>{formatCurrency(totalEntered)}</strong>
        </span>
        {!totalMatch && (
          <span className="text-xs">
            Must equal {formatCurrency(totalFee)} (diff:{" "}
            {formatCurrency(Math.abs(totalEntered - totalFee))})
          </span>
        )}
        {totalMatch && <span className="text-xs font-medium">OK: Amounts match</span>}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-400 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canSubmit || saving}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Confirm Payment Plan"}
        </button>
      </div>
    </div>
  );
}
