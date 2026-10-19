"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WAT_LABEL,
  deriveStatus,
  formatDuration,
  watDateLabel,
  watTime,
  workedMs,
  type AttendanceAction,
  type AttendanceDay,
  type AttendanceStatus,
} from "@/lib/attendance";

type Unresolved = {
  day: AttendanceDay;
  last_active_at: string | null;
  suggested_sign_out_at: string | null;
  others: number;
};

/** How often the heartbeat may fire while someone is using the page. */
const PING_INTERVAL_MS = 2.5 * 60_000;
/** Input older than this means nobody is at the keyboard. */
const IDLE_AFTER_MS = 3 * 60_000;

/**
 * "HH:MM" WAT on a shift's date, as an ISO instant. A time earlier than
 * the sign-in is read as the next morning — a shift that ran past
 * midnight. WAT is UTC+1 with no daylight saving, so the offset is fixed.
 */
function watTimeOnShift(day: AttendanceDay, hhmm: string): string {
  const base = new Date(`${day.work_date}T${hhmm}:00+01:00`);
  if (base.getTime() < new Date(day.signed_in_at).getTime()) {
    return new Date(base.getTime() + 86_400_000).toISOString();
  }
  return base.toISOString();
}

/**
 * The sign in / break / sign out control in the dashboard header.
 *
 * Lives in the header on every page precisely so nobody has to remember to
 * navigate somewhere to sign out. The clock shown is WAT, derived from the
 * browser instant but formatted in Africa/Lagos — and every recorded time
 * comes from the server, never from here.
 */
export default function AttendanceClock() {
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>("off");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Working without having signed in today: when that stretch began.
  const [activeSince, setActiveSince] = useState<string | null>(null);

  // A previous shift left open, and the worker's own fix for it.
  const [unresolved, setUnresolved] = useState<Unresolved | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixTime, setFixTime] = useState("");
  const [fixNote, setFixNote] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  const [fixMessage, setFixMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/am/attendance", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setDay(data.day ?? null);
      setStatus(data.status ?? "off");
      setUnresolved(data.unresolved ?? null);
      setActiveSince(data.active_since ?? null);
    } catch {
      // Transient — the widget simply keeps its last known state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ticks the wall clock and the running worked-time counter.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Someone signed in on another tab or device — stay in step, and pick up
  // the WAT day rollover for anyone who leaves the dashboard open overnight.
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  // Heartbeat (migration 127): tells the server someone is actually using
  // the dashboard, which is what hours are credited from. Only while the
  // tab is visible and there was keyboard or mouse input recently, so a
  // laptop left open overnight does not count as working.
  const lastInput = useRef(Date.now());
  const lastPing = useRef(0);
  useEffect(() => {
    const mark = () => {
      lastInput.current = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const tick = () => {
      const t = Date.now();
      if (document.visibilityState !== "visible") return;
      if (t - lastInput.current > IDLE_AFTER_MS) return;
      if (t - lastPing.current < PING_INTERVAL_MS) return;
      lastPing.current = t;
      fetch("/api/am/attendance/ping", { method: "POST" }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener("visibilitychange", tick);
      clearInterval(id);
    };
  }, []);

  function openFix() {
    if (!unresolved) return;
    setFixOpen(true);
    setFixMessage(null);
    setFixNote("");
    setFixTime(
      unresolved.suggested_sign_out_at ? watTime(unresolved.suggested_sign_out_at) : ""
    );
  }

  async function submitFix(hhmm: string) {
    if (!unresolved) return;
    if (!/^\d{2}:\d{2}$/.test(hhmm)) {
      setFixMessage("Enter a time as HH:MM.");
      return;
    }
    setFixBusy(true);
    setFixMessage(null);
    try {
      const res = await fetch("/api/am/attendance/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day_id: unresolved.day.id,
          signed_out_at: watTimeOnShift(unresolved.day, hhmm),
          note: fixNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFixMessage(data.error ?? "Something went wrong.");
        return;
      }
      if (data.outcome === "requested") {
        setFixMessage("Sent to a manager to approve. Thanks.");
        setTimeout(() => setFixOpen(false), 2500);
      } else {
        setFixOpen(false);
      }
      await load();
    } catch {
      setFixMessage("Network error.");
    } finally {
      setFixBusy(false);
    }
  }

  async function perform(action: AttendanceAction, fromActivity = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/am/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The server recomputes the backdated start; this only asks for it.
        body: JSON.stringify({ action, from_activity: fromActivity }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        // The server knows the real state; adopt it rather than guessing.
        if (data.status) setStatus(data.status);
        await load();
        return;
      }
      setDay(data.day ?? null);
      setStatus(data.status ?? deriveStatus(data.day ?? null));
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const clock = watTime(now);
  const worked = day ? formatDuration(workedMs(day, now)) : null;

  const suggested = unresolved?.suggested_sign_out_at
    ? watTime(unresolved.suggested_sign_out_at)
    : null;

  return (
    <div className="relative flex items-center gap-2">
      {unresolved && (
        <button
          onClick={() => (fixOpen ? setFixOpen(false) : openFix())}
          className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-medium hover:bg-amber-200 border border-amber-300"
          title="You did not sign out of an earlier shift"
        >
          Didn&apos;t sign out {watDateLabel(unresolved.day.work_date).split(",")[0]}
        </button>
      )}

      {fixOpen && unresolved && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-300 bg-white p-4 shadow-lg text-sm">
          <p className="text-gray-900">
            You didn&apos;t sign out on{" "}
            <strong>{watDateLabel(unresolved.day.work_date)}</strong> (signed in{" "}
            {watTime(unresolved.day.signed_in_at)}).
          </p>
          {suggested ? (
            <>
              <p className="text-gray-600 mt-2">
                Your last activity on the dashboard was{" "}
                <strong>{watTime(unresolved.last_active_at)}</strong>.
              </p>
              <button
                onClick={() => submitFix(suggested)}
                disabled={fixBusy}
                className="mt-3 w-full px-3 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {fixBusy ? "…" : `Yes, I left around ${suggested}`}
              </button>
              <p className="text-xs text-gray-500 mt-3">Left at a different time?</p>
            </>
          ) : (
            <p className="text-gray-600 mt-2">
              There&apos;s no dashboard activity on record for that day. Enter when
              you left and a manager will approve it.
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <input
              type="time"
              value={fixTime}
              onChange={(e) => setFixTime(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 tabular-nums"
            />
            <button
              onClick={() => submitFix(fixTime)}
              disabled={fixBusy}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-800 font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Save
            </button>
          </div>
          <input
            type="text"
            value={fixNote}
            onChange={(e) => setFixNote(e.target.value)}
            placeholder="Note (optional), e.g. on client calls until 18:30"
            className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
          />
          {suggested && (
            <p className="text-xs text-gray-500 mt-2">
              A time later than {suggested} goes to a manager to approve.
            </p>
          )}
          {unresolved.others > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {unresolved.others} earlier open day{unresolved.others === 1 ? "" : "s"} will
              show next.
            </p>
          )}
          {fixMessage && <p className="text-xs text-amber-800 mt-2">{fixMessage}</p>}
        </div>
      )}

      <div className="hidden sm:flex flex-col items-end leading-tight">
        <span className="text-sm font-semibold text-gray-900 tabular-nums">
          {clock}{" "}
          <span className="text-[10px] font-normal text-gray-400">{WAT_LABEL}</span>
        </span>
        {day && (
          <span className="text-[11px] text-gray-500 tabular-nums">
            {status === "on_break" ? (
              <span className="text-amber-600 font-medium">On break</span>
            ) : status === "done" ? (
              <>out {watTime(day.signed_out_at)} · {worked}</>
            ) : (
              <>in {watTime(day.signed_in_at)} · {worked}</>
            )}
          </span>
        )}
      </div>

      {loading ? (
        <span className="text-xs text-gray-400 px-2">…</span>
      ) : status === "off" && activeSince ? (
        // Forgot to sign in. Starting from when activity began is the
        // obvious choice, so it is the big button; "now" stays available
        // for anyone who was on the dashboard before their shift started.
        <div className="flex items-center gap-2">
          <span className="hidden lg:inline text-xs text-amber-800">
            Working since {watTime(activeSince)}, not signed in
          </span>
          <button
            onClick={() => perform("sign_in", true)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 ring-2 ring-amber-300 animate-pulse"
            title={`You have been active on the dashboard since ${watTime(activeSince)} without signing in`}
          >
            {busy ? "…" : `Sign in from ${watTime(activeSince)}`}
          </button>
          <button
            onClick={() => perform("sign_in")}
            disabled={busy}
            className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          >
            from now
          </button>
        </div>
      ) : status === "off" ? (
        <button
          onClick={() => perform("sign_in")}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? "…" : "Sign In"}
        </button>
      ) : status === "done" ? (
        <span className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-sm font-medium">
          Signed out
        </span>
      ) : (
        <>
          <button
            onClick={() => perform(status === "on_break" ? "break_end" : "break_start")}
            disabled={busy}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 ${
              status === "on_break"
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {status === "on_break" ? "End Break" : "Break"}
          </button>
          <button
            onClick={() => perform("sign_out")}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            Sign Out
          </button>
        </>
      )}

      {error && (
        <span className="hidden md:inline text-xs text-red-600 max-w-[160px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
