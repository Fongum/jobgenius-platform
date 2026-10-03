// ============================================================
// Links in emails must point at the real site.
//
// Production sets NEXT_PUBLIC_SITE_URL only; 19 call sites read the unset
// NEXT_PUBLIC_APP_URL with their own fallbacks, so billing emails linked to
// "undefined/portal/billing", broadcast and interview emails to localhost,
// and profile nudges to a domain that doesn't resolve. lib/app-url.ts is now
// the one place the origin is decided; the guard below keeps it that way.
// ============================================================

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { appUrl, getAppOrigin, PRODUCTION_ORIGIN } from "@/lib/app-url";

const KEYS = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "APP_URL", "VERCEL_ENV", "VERCEL_URL", "NODE_ENV"] as const;
let saved: Record<string, string | undefined>;
// Next types NODE_ENV as read-only; tests need to vary it.
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else env[k] = saved[k];
  }
});

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  Object.assign(env, values);
}

describe("getAppOrigin", () => {
  it("uses NEXT_PUBLIC_SITE_URL, the variable production actually sets", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "https://job-genius.com/", VERCEL_ENV: "production" });
    expect(getAppOrigin()).toBe("https://job-genius.com");
  });

  it("prefers NEXT_PUBLIC_APP_URL when someone does set it", () => {
    setEnv({ NEXT_PUBLIC_APP_URL: "https://staging.job-genius.com", NEXT_PUBLIC_SITE_URL: "https://job-genius.com" });
    expect(getAppOrigin()).toBe("https://staging.job-genius.com");
  });

  it("never returns localhost or undefined in production, even with nothing configured", () => {
    setEnv({ VERCEL_ENV: "production" });
    expect(getAppOrigin()).toBe(PRODUCTION_ORIGIN);
    delete process.env.VERCEL_ENV;
    setEnv({ NODE_ENV: "production" });
    expect(getAppOrigin()).toBe(PRODUCTION_ORIGIN);
  });

  it("links a preview deployment to itself", () => {
    setEnv({ VERCEL_ENV: "preview", VERCEL_URL: "jobgenius-git-fix-abc.vercel.app", NODE_ENV: "production" });
    expect(getAppOrigin()).toBe("https://jobgenius-git-fix-abc.vercel.app");
  });

  it("uses localhost only in local development", () => {
    setEnv({ NODE_ENV: "development" });
    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("adds a missing protocol and strips trailing slashes", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "job-genius.com//" });
    expect(getAppOrigin()).toBe("https://job-genius.com");
  });

  it("appUrl builds absolute links for the paths the emails use", () => {
    setEnv({ NEXT_PUBLIC_SITE_URL: "https://job-genius.com" });
    expect(appUrl("/portal/billing")).toBe("https://job-genius.com/portal/billing");
    expect(appUrl("dashboard/billing")).toBe("https://job-genius.com/dashboard/billing");
  });
});

describe("no direct NEXT_PUBLIC_APP_URL reads", () => {
  // OAuth deliberately falls back to the incoming request's host: the
  // redirect URI must match the host the user started on.
  const ALLOWED = new Set([
    "lib/app-url.ts",
    "app/api/auth/oauth/google/start/route.ts",
    "app/api/auth/oauth/google/callback/route.ts",
  ]);
  const root = path.resolve(__dirname, "..");

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it("every other origin lookup goes through lib/app-url", () => {
    const offenders = ["app", "lib"]
      .flatMap((dir) => walk(path.join(root, dir)))
      .map((file) => path.relative(root, file).split(path.sep).join("/"))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => fs.readFileSync(path.join(root, rel), "utf8").includes("process.env.NEXT_PUBLIC_APP_URL"));
    expect(offenders, "use getAppOrigin()/appUrl() from @/lib/app-url instead").toEqual([]);
  });
});
