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

export function normalizeJobUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
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
