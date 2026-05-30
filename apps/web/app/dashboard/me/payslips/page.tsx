import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { formatCurrency, type Payslip } from "@/lib/payroll";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default async function MyPayslipsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: workers } = await supabaseAdmin
    .from("payroll_workers")
    .select("id, full_name, base_salary, currency, pay_frequency")
    .eq("account_manager_id", user.id)
    .limit(1);

  const worker = workers?.[0];

  if (!worker) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">My Payslips</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            You don&apos;t have a payroll record yet. Contact an administrator if
            you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  const { data: payslipsRaw } = await supabaseAdmin
    .from("payslips")
    .select("*")
    .eq("worker_id", worker.id)
    .in("status", ["issued", "paid"])
    .order("created_at", { ascending: false });

  const payslips = (payslipsRaw ?? []) as Payslip[];
  const periodIds = Array.from(new Set(payslips.map((p) => p.pay_period_id)));
  const { data: periods } = periodIds.length
    ? await supabaseAdmin
        .from("pay_periods")
        .select("id, label, period_start, period_end, pay_date")
        .in("id", periodIds)
    : { data: [] as { id: string; label: string; period_start: string; period_end: string; pay_date: string | null }[] };
  const periodById = new Map((periods ?? []).map((p) => [p.id as string, p]));

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">My Payslips</h1>
      <p className="text-sm text-gray-500 mb-6">
        {worker.full_name} · base {formatCurrency(Number(worker.base_salary) || 0, worker.currency)} / {worker.pay_frequency}
      </p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {payslips.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            No payslips have been issued to you yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Period</th>
                <th className="px-4 py-3 text-left font-semibold">Pay date</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Net pay</th>
                <th className="px-4 py-3 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payslips.map((p) => {
                const period = periodById.get(p.pay_period_id);
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {period?.label ?? "Pay period"}
                      </span>
                      {period && (
                        <p className="text-xs text-gray-400">
                          {fmtDate(period.period_start)} – {fmtDate(period.period_end)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {fmtDate(period?.pay_date ?? null)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(Number(p.net_pay) || 0, p.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/me/payslips/${p.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
