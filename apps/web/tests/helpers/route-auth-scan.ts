// ============================================================
// Static check: does each API route handler validate a caller?
//
// Why this exists: lib/api-guard.ts (the middleware) only checks that SOME
// credential is present — any `Authorization: Bearer x`, any cookie value, any
// `x-ops-key` header gets through. Real validation happens inside each route, so
// one forgotten check leaves a route open to anyone who sends a fake header.
// With 389 routes, that has to be enforced by a test, not by reviewers' memory.
//
// This is a heuristic, not a proof: it recognises the auth helpers this codebase
// uses. It cannot tell that a check is *correct* — only that a handler makes one,
// or is on an explicit, reasoned allowlist. It is deliberately per handler (GET,
// POST, ...), so a file that guards GET but forgets POST is caught.
// ============================================================

import fs from "fs";
import path from "path";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Calls / references that count as validating the caller. */
const AUTH_PATTERNS: RegExp[] = [
  /\brequire[A-Z][A-Za-z]*\s*\(/, // requireJobSeeker, requireAM, requireAdmin, requireOpsAuth, requireExtensionAdmin...
  /\bgetCurrentUser\s*\(/,
  /\bgetAccountManagerFromRequest\s*\(/,
  /\bauthenticateRequest\s*\(/,
  /\bverifyExtension(Session|Token)\s*\(/,
  /\bverify[A-Za-z]*(Signature|Token|Session)\s*\(/,
  /\bisAuthorized[A-Za-z]*\s*\(/,
  /\bauthorize[A-Za-z]*\s*\(/,
  /\bCRON_SECRET\b/,
  /\bOPS_API_KEY\b/,
  /\bx-ops-key\b/,
  /\btimingSafeEqual\b/,
];

export function hasAuthSignal(source: string): boolean {
  return AUTH_PATTERNS.some((pattern) => pattern.test(source));
}

type Block = { name: string; body: string };

/** Top-level functions, assuming the standard layout where a function ends at a column-0 `}`. */
function topLevelFunctions(source: string): Block[] {
  const blocks: Block[] = [];
  const start = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let match: RegExpExecArray | null;
  while ((match = start.exec(source))) {
    const end = source.indexOf("\n}", match.index);
    blocks.push({ name: match[1], body: source.slice(match.index, end === -1 ? source.length : end + 2) });
  }
  return blocks;
}

export type HandlerAnalysis = {
  method: HttpMethod;
  protected: boolean;
  /** "self" if the handler validates directly, or the local helper it delegates to. */
  via: string | null;
};

/**
 * Per-handler analysis of one route.ts source. A handler counts as protected if it,
 * or a local function it calls (followed up to `depth` levels), validates a caller.
 */
export function analyzeRouteSource(rawSource: string, depth = 2): HandlerAnalysis[] {
  // A comment that merely mentions requireAdmin() must not count as protection.
  const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const functions = topLevelFunctions(source);
  const byName = new Map(functions.map((f) => [f.name, f]));

  const findAuth = (body: string, level: number, seen: Set<string>): string | null => {
    if (hasAuthSignal(body)) return "self";
    if (level === 0) return null;
    for (const [name, fn] of Array.from(byName)) {
      if (seen.has(name) || !new RegExp(`\\b${name}\\s*\\(`).test(body)) continue;
      seen.add(name);
      const via = findAuth(fn.body.replace(/^[^{]*\{/, ""), level - 1, seen);
      if (via) return name;
    }
    return null;
  };

  const results: HandlerAnalysis[] = [];
  for (const fn of functions) {
    if (!(HTTP_METHODS as readonly string[]).includes(fn.name)) continue;
    if (!new RegExp(`^export\\s+(?:async\\s+)?function\\s+${fn.name}\\b`, "m").test(fn.body)) continue;
    // Search only the handler's own body, so its own name is not seen as a "call".
    const own = fn.body.replace(/^[^{]*\{/, "");
    const via = findAuth(own, depth, new Set([fn.name]));
    results.push({ method: fn.name as HttpMethod, protected: via !== null, via });
  }
  return results;
}

// ─── Filesystem scan ─────────────────────────────────────────

const API_ROOT = path.resolve(__dirname, "..", "..", "app", "api");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

export type RouteScan = { route: string; file: string; handlers: HandlerAnalysis[] };

/** Every route under app/api, keyed by its URL path (e.g. "am/queue", "recruiter/respond/[token]"). */
export function scanApiRoutes(root: string = API_ROOT): RouteScan[] {
  return walk(root)
    .map((file) => {
      const route = path.relative(root, path.dirname(file)).split(path.sep).join("/");
      return { route, file, handlers: analyzeRouteSource(fs.readFileSync(file, "utf8")) };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

export type UnprotectedHandler = { route: string; method: HttpMethod };

export function unprotectedHandlers(scans: RouteScan[]): UnprotectedHandler[] {
  return scans.flatMap((scan) =>
    scan.handlers.filter((h) => !h.protected).map((h) => ({ route: scan.route, method: h.method }))
  );
}
