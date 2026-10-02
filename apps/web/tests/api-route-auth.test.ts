// ============================================================
// Every API route handler must validate its caller — or be listed here, with a reason.
//
// lib/api-guard.ts only checks that SOME credential is present (any Bearer value,
// any cookie, any x-ops-key header). It does not validate anything. So a handler
// that forgets its own check is open to anyone who sends `Authorization: Bearer x`.
//
// This test found two such handlers on 2026-09-20:
//   POST /api/apply/next        — no authentication at all; advanced/failed runs
//   POST /api/apply/screenshot  — checked only that an Authorization or x-runner
//                                 header was PRESENT; anyone could upload files
// Both are now fixed (and have tests in routes-apply-auth.test.ts).
//
// Adding a route with no recognisable auth check fails this test. Either add the
// check (usually requireAMAccessToSeeker / requireAM / requireOpsAuth), or add the
// route to ALLOWLIST below with an honest reason. Read tests/helpers/route-auth-scan.ts
// for what "recognisable" means and what this cannot prove.
// ============================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  analyzeRouteSource,
  scanApiRoutes,
  unprotectedHandlers,
  type HttpMethod,
} from "./helpers/route-auth-scan";

type Kind =
  | "public" //          intentionally callable without a session; must also be in api-guard's public list
  | "self-validating" // validates a token/cookie in a way the scanner cannot recognise
  | "stub" //            disabled; returns 410/404 and does nothing
  | "low-sensitivity"; // deliberately unauthenticated and harmless

type Allowed = { methods: HttpMethod[] | "*"; kind: Kind; reason: string };

const ALLOWLIST: Record<string, Allowed> = {
  "health": { methods: "*", kind: "public", reason: "Liveness probe; returns a static { status: \"ok\" }." },
  "auth/login": { methods: "*", kind: "public", reason: "Login: the handler validates the submitted credentials." },
  "auth/signup": { methods: "*", kind: "public", reason: "Account creation." },
  "auth/reset-password": { methods: "*", kind: "public", reason: "Password reset request/confirm; rate limited, the token is validated by Supabase." },
  "auth/parse-resume": { methods: "*", kind: "public", reason: "Pre-signup résumé parsing; rate limited in lib/resume-parse-endpoint." },
  "auth/oauth/google/start": { methods: "*", kind: "public", reason: "Starts the Google OAuth flow." },
  "auth/oauth/google/callback": { methods: "*", kind: "public", reason: "Completes the OAuth flow by exchanging the one-time code with Supabase." },
  "extension/auth": { methods: "*", kind: "public", reason: "Extension login (rate limited); DELETE revokes by session token hash." },
  "interview-confirm": { methods: "*", kind: "public", reason: "Candidate confirms an interview slot; gated by the interview's candidate_token." },
  "marketing/lead": { methods: "*", kind: "public", reason: "Public lead form." },
  "marketing/hire-intake": { methods: "*", kind: "public", reason: "Public hiring-intake form." },
  "outreach/track/open/[token]": { methods: "*", kind: "public", reason: "Email open-tracking pixel, keyed by an opaque token." },
  "portal/gmail/callback": { methods: "*", kind: "public", reason: "Gmail OAuth callback; validated by the OAuth `state`." },
  "public/capacity": { methods: "*", kind: "public", reason: "Public capacity indicator (under /api/public/)." },
  "public/parse-resume": { methods: "*", kind: "public", reason: "Public résumé parser (under /api/public/)." },
  "recruiter/respond/[token]": { methods: "*", kind: "public", reason: "Recruiter response link; gated by the URL token." },

  "auth/logout": { methods: "*", kind: "self-validating", reason: "Signs out the caller's own session/cookies; nothing to protect." },
  "auth/refresh": { methods: "*", kind: "self-validating", reason: "Refreshes the caller's own session from their refresh cookie." },
  "recruiter/partner/logout": { methods: "*", kind: "self-validating", reason: "Clears the caller's own partner-session cookie." },
  "extension/me": { methods: "*", kind: "self-validating", reason: "Validates the extension session token (sha256 hash + expiry) inline, then returns the AM profile." },

  "seed/demo": { methods: "*", kind: "stub", reason: "Disabled permanently (it once seeded demo data into production): always 404." },

  "discovery/run": {
    methods: ["GET"],
    kind: "low-sensitivity",
    reason: "GET returns usage docs plus the names and public base URLs of enabled job sources. POST (which does work) is authenticated. Consider adding auth.",
  },
};

const scans = scanApiRoutes();
const unprotected = unprotectedHandlers(scans);

const covers = (entry: Allowed, method: HttpMethod) => entry.methods === "*" || entry.methods.includes(method);

// ─── The rule ────────────────────────────────────────────────

describe("API route authentication manifest", () => {
  it("scans the whole API surface (guards against the scanner silently matching nothing)", () => {
    expect(scans.length).toBeGreaterThan(300);
    expect(scans.reduce((n, s) => n + s.handlers.length, 0)).toBeGreaterThan(400);
    // Every route file exposes at least one handler the scanner understood.
    expect(scans.filter((s) => s.handlers.length === 0).map((s) => s.route)).toEqual([]);
  });

  it("every handler validates its caller, or is on the reasoned allowlist", () => {
    const violations = unprotected
      .filter((h) => {
        const entry = ALLOWLIST[h.route];
        return !entry || !covers(entry, h.method);
      })
      .map((h) => `${h.method} /api/${h.route}`);

    expect(
      violations,
      "These handlers have no recognisable auth check. The middleware only checks that a credential is " +
        "PRESENT, so a fake header gets through. Add a check (requireAMAccessToSeeker / requireAM / requireOpsAuth ...) " +
        "or add the route to ALLOWLIST with a reason."
    ).toEqual([]);
  });

  it("the allowlist stays honest: every entry is a real route that is still unprotected", () => {
    const routes = new Map(scans.map((s) => [s.route, s]));
    const problems: string[] = [];

    for (const [route, entry] of Object.entries(ALLOWLIST)) {
      const scan = routes.get(route);
      if (!scan) {
        problems.push(`${route}: no such route (remove the entry)`);
        continue;
      }
      const stillOpen = scan.handlers.filter((h) => !h.protected && covers(entry, h.method));
      if (stillOpen.length === 0) problems.push(`${route}: now has an auth check (remove the entry)`);
      if (!entry.reason.trim()) problems.push(`${route}: missing a reason`);
    }

    expect(problems).toEqual([]);
  });
});

// ─── The allowlist agrees with the middleware ────────────────

function readGuardLists() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "lib", "api-guard.ts"), "utf8");
  const exact = Array.from(source.match(/PUBLIC_API_EXACT = new Set\(\[([\s\S]*?)\]\)/)![1].matchAll(/"([^"]+)"/g), (m) => m[1]);
  const prefixes = Array.from(source.match(/PUBLIC_API_PREFIXES = \[([\s\S]*?)\]/)![1].matchAll(/"([^"]+)"/g), (m) => m[1]);
  return { exact, prefixes };
}

describe("allowlist vs lib/api-guard.ts public lists", () => {
  const { exact, prefixes } = readGuardLists();
  const isGuardPublic = (route: string) =>
    exact.includes(`/api/${route}`) || prefixes.some((prefix) => `/api/${route}`.startsWith(prefix));

  it("reads the guard's lists (sanity)", () => {
    expect(exact.length).toBeGreaterThan(5);
    expect(prefixes.length).toBeGreaterThan(2);
  });

  it('a "public" allowlist entry is actually public in the middleware, and nothing else is claimed public', () => {
    const mismatches = Object.entries(ALLOWLIST)
      .filter(([route, entry]) => (entry.kind === "public") !== isGuardPublic(route))
      .map(([route, entry]) => `${route}: kind=${entry.kind} but middleware public=${isGuardPublic(route)}`);
    expect(mismatches).toEqual([]);
  });

  it("every path in the guard's public lists is a real route (no stale public exceptions)", () => {
    const routes = scans.map((s) => `/api/${s.route}`);
    const stale = [
      ...exact.filter((p) => !routes.includes(p)),
      ...prefixes.filter((prefix) => !routes.some((r) => r.startsWith(prefix))),
    ];
    expect(stale).toEqual([]);
  });
});

// ─── The analyzer itself ─────────────────────────────────────

describe("analyzeRouteSource", () => {
  const src = (body: string) => `import x from "y";\n\n${body}\n`;

  it("marks a handler that calls a recognised helper as protected", () => {
    const [h] = analyzeRouteSource(src(`export async function GET(req: Request) {\n  const a = await requireAM(req);\n  return Response.json({});\n}`));
    expect(h).toMatchObject({ method: "GET", protected: true, via: "self" });
  });

  it("marks a handler with no check as unprotected", () => {
    const [h] = analyzeRouteSource(src(`export async function POST(req: Request) {\n  return Response.json({});\n}`));
    expect(h).toMatchObject({ method: "POST", protected: false });
  });

  it("is per handler: a guarded GET does not protect an unguarded POST", () => {
    const result = analyzeRouteSource(
      src(
        `export async function GET(req: Request) {\n  await requireAdmin(req);\n  return Response.json({});\n}\n\n` +
          `export async function POST(req: Request) {\n  return Response.json({});\n}`
      )
    );
    expect(result.map((r) => [r.method, r.protected])).toEqual([["GET", true], ["POST", false]]);
  });

  it("follows a delegating handler into a local helper (the runAlerts / runJobs pattern)", () => {
    const [h] = analyzeRouteSource(
      src(
        `async function run(req: Request) {\n  const auth = requireOpsAuth(req.headers);\n  return Response.json({});\n}\n\n` +
          `export async function POST(req: Request) {\n  return run(req);\n}`
      )
    );
    expect(h).toMatchObject({ protected: true, via: "run" });
  });

  it("follows helpers two levels deep, but not further", () => {
    const chain = (n: number) =>
      `async function h3(r: Request) { requireAM(r); }\n`.replace("{ requireAM(r); }", "{\n  requireAM(r);\n}") +
      `\nasync function h2(r: Request) {\n  return h3(r);\n}\n\nasync function h1(r: Request) {\n  return h2(r);\n}\n\nexport async function GET(r: Request) {\n  return h${n}(r);\n}`;
    expect(analyzeRouteSource(src(chain(2)))[0].protected).toBe(true); // GET -> h2 -> h3
    expect(analyzeRouteSource(src(chain(1)))[0].protected).toBe(false); // GET -> h1 -> h2 -> h3 is three levels
  });

  it("does not treat a helper without auth as protection", () => {
    const [h] = analyzeRouteSource(
      src(`async function helper() {\n  return 1;\n}\n\nexport async function GET() {\n  return Response.json(helper());\n}`)
    );
    expect(h.protected).toBe(false);
  });

  it("ignores a recognised helper that only appears in a comment", () => {
    const [h] = analyzeRouteSource(
      src(`export async function GET() {\n  // TODO: requireAdmin(request) here\n  /* requireAM() */\n  return Response.json({});\n}`)
    );
    expect(h.protected).toBe(false);
  });

  it("survives recursive helpers and ignores non-handler exports", () => {
    const result = analyzeRouteSource(
      src(`async function loop() {\n  return loop();\n}\n\nexport async function GET() {\n  return loop();\n}\n\nexport const dynamic = "force-dynamic";`)
    );
    expect(result).toHaveLength(1);
    expect(result[0].protected).toBe(false);
  });

  it("recognises the other auth mechanisms this codebase uses", () => {
    for (const call of [
      "getCurrentUser()",
      "getAccountManagerFromRequest(h)",
      "authenticateRequest(r)",
      "verifyExtensionSession(r)",
      "verifyRetellWebhookSignature(a, b)",
      "requireAMAccessToSeeker(h, id)",
      "isAuthorizedCron(r)",
    ]) {
      const [h] = analyzeRouteSource(src(`export async function GET(r: Request) {\n  await ${call};\n  return Response.json({});\n}`));
      expect(h.protected, call).toBe(true);
    }
  });
});
