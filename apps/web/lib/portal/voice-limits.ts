// ============================================================
// Cost guard for the live voice mock interview (OpenAI Realtime).
//
// Every voice session bills realtime audio, and the token-mint route used to
// be uncapped: any signed-in seeker could mint unlimited sessions. Two rules:
//
//   1. DAILY CAP     — max sessions a seeker can start in a rolling 24h
//                      (VOICE_PREP_DAILY_SESSIONS, default 10; 0 = voice
//                      practice paused). Abandoned sessions count — the
//                      audio was still billed.
//   2. TOKEN BINDING — a realtime token can only be minted for a session the
//                      seeker just created (in_progress, started within
//                      TOKEN_SESSION_WINDOW_MS). Since sessions are capped,
//                      tokens are too.
//
// Pure functions so the policy is unit-testable without Supabase/OpenAI.
// ============================================================

export const DEFAULT_VOICE_DAILY_SESSIONS = 10;
export const VOICE_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
export const TOKEN_SESSION_WINDOW_MS = 5 * 60 * 1000;

export function getVoiceDailySessionCap(
  raw: string | undefined = process.env.VOICE_PREP_DAILY_SESSIONS
): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_VOICE_DAILY_SESSIONS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_VOICE_DAILY_SESSIONS;
  return Math.floor(parsed);
}

export type VoiceQuotaVerdict =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: "PAUSED" | "DAILY_CAP_REACHED"; retryAfterSeconds: number };

export function evaluateVoiceQuota(input: {
  /** created_at of the seeker's sessions (any status, any prep). */
  sessionStarts: Date[];
  dailyCap: number;
  now?: Date;
}): VoiceQuotaVerdict {
  const now = input.now ?? new Date();
  const cap = input.dailyCap;

  if (cap <= 0) {
    return { allowed: false, reason: "PAUSED", retryAfterSeconds: 0 };
  }

  const cutoff = now.getTime() - VOICE_QUOTA_WINDOW_MS;
  const inWindow = input.sessionStarts
    .map((d) => d.getTime())
    .filter((t) => Number.isFinite(t) && t > cutoff)
    .sort((a, b) => a - b);

  if (inWindow.length < cap) {
    return { allowed: true, remaining: cap - inWindow.length - 1 };
  }

  // A slot frees up when the (count - cap + 1)th-oldest session leaves the window.
  const freeingSession = inWindow[inWindow.length - cap];
  const retryAfterMs = freeingSession + VOICE_QUOTA_WINDOW_MS - now.getTime();
  return {
    allowed: false,
    reason: "DAILY_CAP_REACHED",
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

export function isSessionEligibleForToken(input: {
  status: string | null | undefined;
  startedAt: string | Date | null | undefined;
  now?: Date;
}): boolean {
  if (input.status !== "in_progress" || !input.startedAt) return false;
  const started = new Date(input.startedAt).getTime();
  if (!Number.isFinite(started)) return false;
  const age = (input.now ?? new Date()).getTime() - started;
  return age >= 0 && age <= TOKEN_SESSION_WINDOW_MS;
}

export function voiceQuotaMessage(verdict: Extract<VoiceQuotaVerdict, { allowed: false }>): string {
  if (verdict.reason === "PAUSED") {
    return "Voice practice is currently unavailable.";
  }
  const hours = Math.ceil(verdict.retryAfterSeconds / 3600);
  return `You've reached today's limit for voice mock interviews. Try again in about ${hours} hour${hours === 1 ? "" : "s"} — the text Q&A and quiz practice are still available.`;
}
