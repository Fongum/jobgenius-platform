"use client";

import { useState, useEffect } from "react";

interface Installment {
  amount: string;
  proposedDate: string;
}

interface InstallmentPlanStepProps {
  planType: "essentials" | "premium";
  onContinue: () => void;
  onBack: () => void;
}

const PAYMENT_WINDOW_MONTHS = 1;
const today = new Date();
today.setHours(0, 0, 0, 0);
const maxDate = new Date(today);
maxDate.setMonth(maxDate.getMonth() + PAYMENT_WINDOW_MONTHS);
const paymentWindowDays = Math.max(
  1,
  Math.round((maxDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
);

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
  const [count, setCount] = useState<1 | 2 | 3>(1);
  const [installments, setInstallments] = useState<Installment[]>([
    { amount: String(totalFee), proposedDate: formatDateInput(today) },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-initialize installments when count changes
  useEffect(() => {
    const base = Math.floor(totalFee / count);
    const remainder = totalFee - base * count;
    const newInstallments: Installment[] = Array.from({ length: count }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + Math.floor((paymentWindowDays / count) * i));
      return {
        amount: i === count - 1 ? String(base + remainder) : String(base),
        proposedDate: formatDateInput(d),
      };
    });
    setInstallments(newInstallments);
  }, [count, totalFee]);

  const updateInstallment = (index: number, field: keyof Installment, value: string) => {
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

  const canSubmit = totalMatch && allDatesValid && installments.every((i) => i.amount && parseFloat(i.amount) > 0);

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
          installments: installments.map((i) => ({
            amount: parseFloat(i.amount),
            proposedDate: i.proposedDate,
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Payment Schedule</h2>
        <p className="text-gray-600 mt-1 text-sm">
          Your registration fee is <strong>{formatCurrency(totalFee)}</strong>. Choose how you&apos;d like to pay - all installments must be completed within 1 month of today ({maxDate.toLocaleDateString("en-US")}).
        </p>
      </div>

      {/* Installment count selector */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-800 mb-2">
          Number of installments
        </label>
        <div className="flex gap-3">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={`flex-1 py-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                count === n
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-gray-400 text-gray-800 hover:border-blue-400"
              }`}
            >
              {n} {n === 1 ? "Payment" : "Payments"}
            </button>
          ))}
        </div>
      </div>

      {/* Installment rows */}
      <div className="space-y-3 mb-4">
        {installments.map((inst, i) => {
          const dateVal = inst.proposedDate;
          const dateObj = dateVal ? new Date(dateVal) : null;
          const dateInvalid = dateObj && (dateObj < today || dateObj > maxDate);

          return (
            <div key={i} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm font-semibold text-gray-800 mb-3">
                Installment {i + 1}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={inst.amount}
                    onChange={(e) => updateInstallment(i, "amount", e.target.value)}
                    className="w-full border border-gray-400 bg-white text-gray-900 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">Proposed Date</label>
                  <input
                    type="date"
                    value={inst.proposedDate}
                    min={formatDateInput(today)}
                    max={formatDateInput(maxDate)}
                    onChange={(e) => updateInstallment(i, "proposedDate", e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      dateInvalid ? "border-red-400 bg-red-50 text-gray-900" : "border-gray-400 bg-white text-gray-900"
                    }`}
                  />
                  {dateInvalid && (
                    <p className="text-xs text-red-500 mt-1">Must be within 1 month</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total validation */}
      <div className={`rounded-lg p-3 mb-4 text-sm flex items-center justify-between ${
        totalMatch ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"
      }`}>
        <span>Total: <strong>{formatCurrency(totalEntered)}</strong></span>
        {!totalMatch && (
          <span className="text-xs">
            Must equal {formatCurrency(totalFee)} (diff: {formatCurrency(Math.abs(totalEntered - totalFee))})
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

