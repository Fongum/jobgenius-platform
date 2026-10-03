// ============================================================
// The site's public origin, for links in emails and server-to-server calls.
//
// Production sets NEXT_PUBLIC_SITE_URL and nothing else; NEXT_PUBLIC_APP_URL,
// which 19 call sites read, is set nowhere (no Vercel env, no .env file).
// Each site picked its own fallback, so in production billing emails linked
// to "undefined/portal/billing", broadcast and interview emails to
// http://localhost:3000, conversation notifications to relative (dead)
// paths, profile nudges to https://app.jobgenius.ai (doesn't resolve), and
// the global-jobs match trigger POSTed to localhost. Read the origin here.
//
// NEXT_PUBLIC_* values are inlined at build time, so this is safe to call
// from client components too.
// ============================================================

export const PRODUCTION_ORIGIN = "https://job-genius.com";

function clean(origin: string): string {
  const trimmed = origin.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getAppOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL;
  if (configured && configured.trim()) return clean(configured);

  // A preview deployment should link to itself, not to production.
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return clean(process.env.VERCEL_URL);
  }

  // Never localhost in production, whatever else is missing.
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return PRODUCTION_ORIGIN;
  }

  return "http://localhost:3000";
}

/** Absolute URL for an app path: appUrl("/portal/billing"). */
export function appUrl(path: string): string {
  return `${getAppOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
