// ============================================================
// The auto-matcher only queues jobs autonomous apply can actually run.
//
// On 2026-10-02, 127 of the 131 job posts parked in NEEDS_ATTENTION in
// production were aggregator links (adzuna, arbeitnow, themuse) that the
// apply-time preflight rejects as HOST_UNSUPPORTED. They were queued anyway,
// and each burned an AI tailoring call before failing. isAutoQueueable runs
// the same preflight at queue time and drops only the outcomes no later state
// can change.
// ============================================================

import { describe, it, expect, vi } from "vitest";

// The preflight module (and lib/apply under it) import database clients for
// unrelated helpers; nothing here touches them.
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: {} }));
vi.mock("@/lib/auth", () => ({ supabaseAdmin: {} }));

import { isAutoQueueable } from "@/lib/auto-apply-preflight";

const ALLOWED = new Set(["LINKEDIN", "GREENHOUSE", "WORKDAY", "LEVER", "SMARTRECRUITERS", "GENERIC"]);
const check = (url: string | null, source: string | null = null) =>
  isAutoQueueable({ url, source, allowedAts: ALLOWED });

describe("isAutoQueueable", () => {
  it.each([
    ["https://www.adzuna.com/land/ad/4812345678?se=abc", "adzuna"],
    ["https://www.arbeitnow.com/jobs/companies/acme/backend-engineer-12345", "arbeitnow"],
    ["https://www.themuse.com/jobs/acme/senior-data-engineer", "themuse"],
  ])("drops the aggregator links that filled the production queue (%s)", (url, source) => {
    expect(check(url, source)).toMatchObject({ queueable: false, reasonCode: "HOST_UNSUPPORTED" });
  });

  it.each([
    "https://boards.greenhouse.io/acme/jobs/123456",
    "https://jobs.lever.co/acme/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab",
    "https://acme.wd5.myworkdayjobs.com/en-US/careers/job/Remote/Engineer_R123",
  ])("keeps jobs on a supported ATS (%s)", (url) => {
    expect(check(url)).toMatchObject({ queueable: true, reasonCode: null });
  });

  it("keeps LinkedIn even with no saved session — that can be fixed by opening the extension", () => {
    expect(check("https://www.linkedin.com/jobs/view/4012345678")).toMatchObject({ queueable: true });
  });

  it("drops an ATS that isn't allowed for autonomous apply", () => {
    expect(check("https://www.indeed.com/viewjob?jk=abc123", "indeed")).toMatchObject({
      queueable: false,
      reasonCode: "ATS_UNSUPPORTED",
    });
  });

  it.each([null, "", "not a url", "ftp://example.com/job"])("drops a missing or unusable link (%s)", (url) => {
    expect(check(url)).toMatchObject({ queueable: false, reasonCode: "JOB_URL_INVALID" });
  });

  it("follows the configured allow-list, so enabling an ATS re-enables queueing", () => {
    const withIndeed = new Set([...ALLOWED, "INDEED"]);
    expect(
      isAutoQueueable({ url: "https://www.indeed.com/viewjob?jk=abc123", source: "indeed", allowedAts: withIndeed })
        .queueable
    ).toBe(true);
  });
});
