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

  // OPS keys are accepted only via headers to avoid query-string leakage in logs.
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

export function requireOpsAuth(headersSource?: Headers, _url?: string) {
  if (
    isOpsApiKey(headersSource) ||
    isServiceKey(headersSource)
  ) {
    return { ok: true } as const;
  }
  return { ok: false, error: "Not authorized." } as const;
}
