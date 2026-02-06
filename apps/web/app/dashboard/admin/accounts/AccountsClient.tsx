"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface AccountManager {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  am_code: string | null;
  created_at: string;
  last_login_at: string | null;
  assignmentCount: number;
}

export default function AccountsClient({
  accountManagers,
  isSuperAdmin,
  currentUserId,
}: {
  accountManagers: AccountManager[];
  isSuperAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showCreate = searchParams.get("action") === "create";

  const [isCreating, setIsCreating] = useState(showCreate);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "admin" | "am">("all");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "am",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Separate pending accounts
  const pendingAccounts = accountManagers.filter((am) => am.status === "pending");
  const approvedAccounts = accountManagers.filter((am) => am.status === "approved");

  const filtered = accountManagers.filter((am) => {
    if (filter === "pending" && am.status !== "pending") return false;
    if (filter === "approved" && am.status !== "approved") return false;
    if (filter === "admin" && !["admin", "superadmin"].includes(am.role)) return false;
    if (filter === "am" && am.role !== "am") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (am.name || "").toLowerCase().includes(q) ||
        am.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const createAccount = async () => {
    if (!form.email || !form.password) {
      setMessage({ type: "error", text: "Email and password are required." });
      return;
    }
    if (form.password.length < 8) {
      setMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to create account." });
        return;
      }

      setMessage({ type: "success", text: "Account created successfully!" });
      setForm({ email: "", password: "", name: "", role: "am" });
      setIsCreating(false);
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (amId: string, newRole: string) => {
    if (amId === currentUserId) {
      setMessage({ type: "error", text: "You cannot change your own role." });
      return;
    }

    try {
      const res = await fetch(`/api/admin/accounts/${amId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to update role." });
        return;
      }

      setMessage({ type: "success", text: "Role updated." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    }
  };

  const approveAccount = async (amId: string) => {
    setProcessing(amId);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/accounts/${amId}/approve`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to approve." });
        return;
      }

      setMessage({ type: "success", text: "Account approved!" });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(null);
    }
  };

  const rejectAccount = async (amId: string) => {
    setProcessing(amId);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/accounts/${amId}/reject`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to reject." });
        return;
      }

      setMessage({ type: "success", text: "Account rejected." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Managers</h1>
          <p className="text-gray-600">{accountManagers.length} total</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
        >
          {isCreating ? "Cancel" : "Create Account"}
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Pending Approvals Banner */}
      {pendingAccounts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="font-semibold text-amber-800">
              {pendingAccounts.length} Pending Approval{pendingAccounts.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="space-y-2">
            {pendingAccounts.map((am) => (
              <div
                key={am.id}
                className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-amber-100"
              >
                <div>
                  <p className="font-medium text-gray-900">{am.name || "Unnamed"}</p>
                  <p className="text-sm text-gray-500">{am.email}</p>
                  <p className="text-xs text-gray-400">
                    Signed up {new Date(am.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveAccount(am.id)}
                    disabled={processing === am.id}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {processing === am.id ? "..." : "Approve"}
                  </button>
                  <button
                    onClick={() => rejectAccount(am.id)}
                    disabled={processing === am.id}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Form */}
      {isCreating && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Create New Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min 8 characters"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="am">Account Manager</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="superadmin">Super Admin</option>}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Note: Accounts created by admins are auto-approved.
          </p>
          <button
            onClick={createAccount}
            disabled={saving}
            className="mt-4 px-6 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating..." : "Create Account"}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "all" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              All ({accountManagers.length})
            </button>
            {pendingAccounts.length > 0 && (
              <button
                onClick={() => setFilter("pending")}
                className={`px-3 py-2 text-sm rounded-lg ${
                  filter === "pending" ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-700"
                }`}
              >
                Pending ({pendingAccounts.length})
              </button>
            )}
            <button
              onClick={() => setFilter("approved")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "approved" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              Approved ({approvedAccounts.length})
            </button>
            <button
              onClick={() => setFilter("admin")}
              className={`px-3 py-2 text-sm rounded-lg ${
                filter === "admin" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              Admins ({accountManagers.filter((am) => ["admin", "superadmin"].includes(am.role)).length})
            </button>
          </div>
        </div>
      </div>

      {/* Account List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase hidden sm:table-cell">Email</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Role</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Code</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell">Assigned</th>
              {isSuperAdmin && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No account managers found
                </td>
              </tr>
            ) : (
              filtered.map((am) => (
                <tr key={am.id} className={`hover:bg-gray-50 ${am.status === "pending" ? "bg-amber-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{am.name || "Unnamed"}</p>
                      {am.id === currentUserId && (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">You</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 sm:hidden">{am.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{am.email}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                        am.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : am.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {am.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                        am.role === "superadmin"
                          ? "bg-purple-100 text-purple-800"
                          : am.role === "admin"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {am.role === "superadmin" ? "Super Admin" : am.role === "admin" ? "Admin" : "AM"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    <span className="font-mono text-sm text-gray-600">{am.am_code || "-"}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm hidden lg:table-cell">
                    <span className={am.assignmentCount > 0 ? "text-green-600 font-medium" : "text-gray-400"}>
                      {am.assignmentCount}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-right">
                      {am.status === "pending" ? (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => approveAccount(am.id)}
                            disabled={processing === am.id}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectAccount(am.id)}
                            disabled={processing === am.id}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : am.id !== currentUserId && am.role !== "superadmin" ? (
                        <select
                          value={am.role}
                          onChange={(e) => updateRole(am.id, e.target.value)}
                          className="text-sm border rounded px-2 py-1"
                        >
                          <option value="am">AM</option>
                          <option value="admin">Admin</option>
                          <option value="superadmin">Super Admin</option>
                        </select>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
