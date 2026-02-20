import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase/server";

type EnforceRateLimitInput = {
  request: Request;
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown-ip";
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function asPositiveInt(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const parsed = Math.floor(value);
  return parsed > 0 ? parsed : fallback;
}

export async function enforceRateLimit({
  request,
  scope,
  identifier,
  limit,
  windowSeconds,
  blockSeconds = 0,
}: EnforceRateLimitInput): Promise<RateLimitResult> {
  const normalizedScope = normalize(scope || "api");
  const normalizedIdentifier = normalize(identifier || "anonymous");
  const ip = getClientIp(request);
  const keySeed = `${normalizedScope}|${normalize(ip)}|${normalizedIdentifier}`;
  const key = `rl:${normalizedScope}:${crypto
    .createHash("sha256")
    .update(keySeed)
    .digest("hex")}`;

  const maxAttempts = asPositiveInt(limit, 10);
  const window = asPositiveInt(windowSeconds, 900);
  const block = Math.max(0, Math.floor(Number.isFinite(blockSeconds) ? blockSeconds : 0));

  const { data, error } = await supabaseServer.rpc("check_rate_limit", {
    p_key: key,
    p_limit: maxAttempts,
    p_window_seconds: window,
    p_block_seconds: block,
  });

  if (error || !Array.isArray(data) || data.length === 0) {
    // Fail open if rate limiting backend is unavailable.
    console.error("Rate limit check failed", {
      scope: normalizedScope,
      error: error?.message ?? "no_data",
    });
    return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 };
  }

  const row = data[0] as {
    allowed: boolean;
    remaining: number;
    retry_after_seconds: number;
  };

  return {
    allowed: Boolean(row.allowed),
    remaining: Number.isFinite(Number(row.remaining)) ? Number(row.remaining) : 0,
    retryAfterSeconds: Number.isFinite(Number(row.retry_after_seconds))
      ? Math.max(0, Number(row.retry_after_seconds))
      : window,
  };
}
