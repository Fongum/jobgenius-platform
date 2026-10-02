// ============================================================
// Email brand tokens and per-stream sender personas.
//
// Every outbound notification used to arrive as "noreply" with the same
// unbranded shell, so a scorecard digest and an overnight-shift alert
// were indistinguishable in the inbox list. Branding is split in two:
//
//   - BRAND      : who the mail is from (one product, one identity).
//   - STREAMS    : which part of the product is speaking. The stream
//                  sets the From display name, the header chip and the
//                  accent colour, so the reader can triage on the list
//                  view without opening anything.
//
// Colours are chosen for white text at >= 4.5:1, because they are used
// as button and chip backgrounds.
// ============================================================

export const BRAND = {
  name: "JobGenius",
  /** Two-letter lockup drawn in HTML — never a remote image, which Gmail blocks by default. */
  mark: "JG",
  markBackground: "#6d19f5",
  ink: "#111827",
  muted: "#6b7280",
  hairline: "#e5e7eb",
  canvas: "#f3f4f6",
  surface: "#ffffff",
} as const;

export type EmailStream = {
  /** Appended to the brand name in the From line: "JobGenius People Ops". */
  senderName: string;
  /** Uppercase chip in the header. */
  chip: string;
  accent: string;
  /** Tinted chip background; accent at ~12% over white. */
  accentSoft: string;
  /** Verb for the footer line explaining why this mail arrived. */
  footerNote: string;
};

const PEOPLE_OPS: EmailStream = {
  senderName: "People Ops",
  chip: "People Ops",
  accent: "#6d19f5",
  accentSoft: "#f1e9ff",
  footerNote: "You receive these because you hold a people manager role.",
};

const ATTENDANCE: EmailStream = {
  senderName: "Attendance",
  chip: "Attendance",
  accent: "#b45309",
  accentSoft: "#fdf1e0",
  footerNote: "Attendance alerts go to the worker and their people manager.",
};

const PRODUCTIVITY: EmailStream = {
  senderName: "Productivity",
  chip: "Productivity",
  accent: "#0e7490",
  accentSoft: "#e2f4f8",
  footerNote: "Sent as part of your regular productivity reporting.",
};

const DELIVERY: EmailStream = {
  senderName: "Delivery",
  chip: "Delivery",
  accent: "#1d4ed8",
  accentSoft: "#e6ecfd",
  footerNote: "Sent because you own or watch this delivery case.",
};

const APPLICATIONS: EmailStream = {
  senderName: "Applications",
  chip: "Applications",
  accent: "#4338ca",
  accentSoft: "#eaeafb",
  footerNote: "Sent about applications on your desk.",
};

const PAYROLL: EmailStream = {
  senderName: "Payroll",
  chip: "Payroll",
  accent: "#047857",
  accentSoft: "#e3f4ee",
  footerNote: "Sent about your pay records.",
};

const INTERVIEWS: EmailStream = {
  senderName: "Interviews",
  chip: "Interviews",
  accent: "#be185d",
  accentSoft: "#fce8f0",
  footerNote: "Sent about an interview on your schedule.",
};

const CONTRACTS: EmailStream = {
  senderName: "Contracts",
  chip: "Contracts",
  accent: "#334155",
  accentSoft: "#eaeef3",
  footerNote: "Sent about a contract awaiting your attention.",
};

/** Fallback for a category nobody has classified yet. */
export const DEFAULT_STREAM: EmailStream = {
  senderName: "Notifications",
  chip: "Notification",
  accent: "#6d19f5",
  accentSoft: "#f1e9ff",
  footerNote: "Sent automatically by JobGenius.",
};

/**
 * Exact category -> stream. Prefix rules below catch families, so this map
 * only needs the categories whose names do not carry their own prefix.
 */
const EXACT_STREAMS: Record<string, EmailStream> = {
  application_paused: APPLICATIONS,
  ai_output_rejected: APPLICATIONS,
  interview_confirmed: INTERVIEWS,
  contract_sent: CONTRACTS,
  social_lead_election_closing: PEOPLE_OPS,
  am_productivity_digest: PRODUCTIVITY,
  productivity_review_flag: PRODUCTIVITY,
};

const PREFIX_STREAMS: ReadonlyArray<readonly [string, EmailStream]> = [
  ["payslip_", PAYROLL],
  ["attendance_", ATTENDANCE],
  ["delivery_", DELIVERY],
  ["people_", PEOPLE_OPS],
  ["employee_", PEOPLE_OPS],
];

/** Which part of the product is speaking. Never throws — unknown falls back. */
export function resolveStream(category: string | null | undefined): EmailStream {
  if (!category) return DEFAULT_STREAM;
  const exact = EXACT_STREAMS[category];
  if (exact) return exact;
  for (const [prefix, stream] of PREFIX_STREAMS) {
    if (category.startsWith(prefix)) return stream;
  }
  return DEFAULT_STREAM;
}

/** "JobGenius People Ops" — what Gmail shows instead of a bare "noreply". */
export function senderDisplayName(stream: EmailStream): string {
  return `${BRAND.name} ${stream.senderName}`;
}

/**
 * "JobGenius People Ops <noreply@job-genius.com>". A name containing a comma,
 * quote or bracket is quoted and escaped — an unescaped one truncates the
 * header and the provider rejects the message.
 */
export function formatFromHeader(address: string, displayName?: string | null): string {
  const name = displayName?.trim();
  if (!name) return address;
  // Already a full "Name <addr>" header; leave it alone.
  if (/<[^>]+>/.test(address)) return address;
  // Anything outside a plain word must travel as a quoted-string. JSON
  // escaping of a quote or a backslash is exactly what RFC 5322 wants.
  const needsQuoting = /[^A-Za-z0-9 .'-]/.test(name);
  return `${needsQuoting ? JSON.stringify(name) : name} <${address}>`;
}

/**
 * Absolute origin for email links. Relative hrefs are dead in an inbox.
 *
 * NEXT_PUBLIC_SITE_URL is the one that is actually set in production;
 * NEXT_PUBLIC_APP_URL is read first only because the rest of the codebase
 * reaches for it, and it is defined nowhere — no Vercel env, no .env file.
 * NEXT_PUBLIC_* is inlined at build time, so an unset one does not fall back
 * at runtime, it bakes in as undefined. Hence the explicit check.
 */
export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  return (configured ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Turns a stored link_url (usually "/dashboard/...") into something clickable. */
export function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${appOrigin()}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}
