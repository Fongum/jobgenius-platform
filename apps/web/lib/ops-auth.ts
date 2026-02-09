import { headers } from "next/headers";

function getHeaderValue(source?: Headers, key?: string) {
  if (source && key) {
    return source.get(key);
  }
  if (key) {
    return headers().get(key);
  }
  return null;
}

function getOpsKeyFromUrl(url?: string) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("ops_key");
  } catch {
    return null;
  }
}

export function isOpsApiKey(headersSource?: Headers, url?: string) {
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
  const queryKey = getOpsKeyFromUrl(url);

  return (
    directKey === configuredKey ||
    bearer === configuredKey ||
    queryKey === configuredKey
  );
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

export function requireOpsAuth(headersSource?: Headers, url?: string) {
  if (
    isOpsApiKey(headersSource, url) ||
    isServiceKey(headersSource)
  ) {
    return { ok: true } as const;
  }
  return { ok: false, error: "Not authorized." } as const;
}
