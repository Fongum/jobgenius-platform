const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "ref",
  "refid",
  "ref_id",
  "referrer",
  "ref_src",
  "trk",
  "trkinfo",
  "trackingid",
  "tracking_id",
  "mc_cid",
  "mc_eid",
  "gh_src",
  "lever-source",
]);

const TRACKING_QUERY_PREFIXES = [
  "utm_",
  "li_",
  "mkt_",
  "yclid_",
];

const REDIRECT_QUERY_KEYS = [
  "redirect_to",
  "redirect",
  "redirect_url",
  "target",
  "target_url",
  "destination",
  "dest",
  "apply",
  "apply_url",
  "adurl",
  "url",
  "u",
];

const WRAPPER_HOST_HINTS = [
  "adzuna",
  "appcast",
  "doubleclick",
  "google",
  "lnkd.in",
];

const WRAPPER_PATH_HINTS = [
  "authenticate",
  "externalapply",
  "external-apply",
  "redirect",
  "outbound",
  "away",
];

const IDENTITY_QUERY_KEYS = new Set([
  "id",
  "jobid",
  "job_id",
  "jobid64",
  "jid",
  "jk",
  "vjk",
  "gh_jid",
  "posting_id",
]);

function shouldDropQueryKey(queryKey: string): boolean {
  const key = queryKey.toLowerCase();
  if (IDENTITY_QUERY_KEYS.has(key)) {
    return false;
  }
  if (TRACKING_QUERY_KEYS.has(key)) {
    return true;
  }
  return TRACKING_QUERY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodeUrlLikeValue(value: string) {
  let current = value.trim();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!current.includes("%")) {
      break;
    }
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

function looksLikeWrapperUrl(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (WRAPPER_HOST_HINTS.some((hint) => host.includes(hint))) {
    return true;
  }
  return WRAPPER_PATH_HINTS.some((hint) => path.includes(hint));
}

function extractRedirectTarget(parsed: URL): URL | null {
  if (!looksLikeWrapperUrl(parsed)) {
    return null;
  }

  for (const key of REDIRECT_QUERY_KEYS) {
    const raw = parsed.searchParams.get(key);
    if (!raw) {
      continue;
    }
    const candidate = decodeUrlLikeValue(raw);
    const parsedCandidate = tryParseUrl(candidate);
    if (parsedCandidate) {
      return parsedCandidate;
    }
  }

  return null;
}

export function resolveJobTargetUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  let parsed = tryParseUrl(raw);
  if (!parsed) {
    return raw;
  }

  for (let depth = 0; depth < 3; depth += 1) {
    const redirected = extractRedirectTarget(parsed);
    if (!redirected) {
      break;
    }
    parsed = redirected;
  }

  return parsed.toString();
}

export function normalizeJobUrl(input: string): string {
  const raw = resolveJobTargetUrl(input);
  if (!raw) return "";

  const parsed = tryParseUrl(raw);
  if (!parsed) {
    return raw;
  }

  parsed.hostname = parsed.hostname.toLowerCase();

  // Remove fragments and default ports for stable URL identity.
  parsed.hash = "";
  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  if (parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    if (!parsed.pathname) {
      parsed.pathname = "/";
    }
  }

  const kept = new URLSearchParams();
  for (const [key, value] of Array.from(parsed.searchParams.entries())) {
    if (shouldDropQueryKey(key)) continue;
    kept.append(key, value);
  }

  const sorted = Array.from(kept.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) {
      return aValue.localeCompare(bValue);
    }
    return aKey.localeCompare(bKey);
  });

  const finalParams = new URLSearchParams();
  for (const [key, value] of sorted) {
    finalParams.append(key, value);
  }

  parsed.search = finalParams.toString() ? `?${finalParams.toString()}` : "";
  return parsed.toString();
}
