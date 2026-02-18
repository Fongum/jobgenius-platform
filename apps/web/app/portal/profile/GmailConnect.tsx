"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

export default function GmailConnect() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{
    connected: boolean;
    email?: string;
    lastSyncAt?: string;
    lastError?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/gmail/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle redirect params from OAuth callback
  useEffect(() => {
    const gmailParam = searchParams.get("gmail");
    if (gmailParam === "connected") {
      const email = searchParams.get("email");
      setMessage({
        type: "success",
        text: `Gmail connected successfully${email ? `: ${email}` : ""}!`,
      });
      fetchStatus();
    } else if (gmailParam === "error") {
      const detail = searchParams.get("detail") ?? "unknown";
      setMessage({
        type: "error",
        text: `Failed to connect Gmail (${detail}). Please try again.`,
      });
    }
  }, [searchParams, fetchStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/gmail/connect");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to start Gmail connection.",
        });
        setConnecting(false);
      }
    } catch {
      setMessage({
        type: "error",
        text: "Failed to start Gmail connection.",
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your Gmail account?")) {
      return;
    }
    setDisconnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/gmail/disconnect", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setStatus({ connected: false });
        setMessage({ type: "success", text: "Gmail disconnected." });
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to disconnect.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to disconnect." });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Gmail Connection
        </h3>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Gmail Connection
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Connect a dedicated Gmail account for your job search. We&apos;ll use it
        to send outreach emails, read verification codes during applications, and
        track responses from employers.
      </p>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm mb-4 ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <svg
              className="w-5 h-5 text-green-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800">Connected</p>
              <p className="text-sm text-green-700 truncate">{status.email}</p>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>

          {status.lastSyncAt && (
            <p className="text-xs text-gray-500">
              Last synced:{" "}
              {new Date(status.lastSyncAt).toLocaleString()}
            </p>
          )}
          {status.lastError && (
            <p className="text-xs text-red-500">
              Last error: {status.lastError}
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {connecting ? "Redirecting to Google..." : "Connect Gmail Account"}
        </button>
      )}
    </div>
  );
}
