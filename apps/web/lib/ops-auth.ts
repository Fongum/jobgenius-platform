import { headers } from "next/headers";
import { getAmEmailFromHeaders } from "@/lib/am";

function getHeaderValue(source?: Headers, key?: string) {
  if (source && key) {
    return source.get(key);
  }
  if (key) {
    return headers().get(key);
  }
  return null;
}

function normalizeList(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isOpsApiKey(headersSource?: Headers) {
  const configuredKey = process.env.OPS_API_KEY;
  if (!configuredKey) {
    return false;
  }
  const directKey = getHeaderValue(headersSource, "x-ops-key");
  const authHeader = getHeaderValue(headersSource, "authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

  return directKey === configuredKey || bearer === configuredKey;
}

export function isServiceKey(headersSource?: Headers) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return false;
  }
  const authHeader = getHeaderValue(headersSource, "authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
  return bearer === serviceKey;
}

export function isOpsAdmin(headersSource?: Headers) {
  const adminList = normalizeList(process.env.OPS_ADMIN_EMAILS);
  if (adminList.length === 0) {
    return false;
  }
  const email = getAmEmailFromHeaders(headersSource);
  if (!email) {
    return false;
  }
  return adminList.includes(email);
}

export function requireOpsAuth(headersSource?: Headers) {
  if (isOpsApiKey(headersSource) || isServiceKey(headersSource) || isOpsAdmin(headersSource)) {
    return { ok: true } as const;
  }
  return { ok: false, error: "Not authorized." } as const;
}
