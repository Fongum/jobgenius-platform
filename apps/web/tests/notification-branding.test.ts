// ============================================================
// Branding of outbound notification email.
//
// The failure this guards against is not a crash — it is twenty rows in
// an inbox that all say "noreply" and repeat their own subject back as
// the preview. So the assertions here are mostly about what the reader
// sees before opening anything: the From name, the snippet, and whether
// two different kinds of alert can be told apart.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BRAND,
  DEFAULT_STREAM,
  absoluteUrl,
  formatFromHeader,
  resolveStream,
  senderDisplayName,
} from "@/lib/email/brand";
import {
  derivePreheader,
  escapeHtml,
  renderNotificationEmail,
} from "@/lib/email/notification-email";
import {
  buildManagerDigestBody,
  formatDigestDay,
  formatReviewMonth,
} from "@/lib/people-ops-digest";
import type { PeopleOpsReminderSnapshot } from "@/lib/people-server";

const ORIGIN = "https://app.job-genius.com";

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("resolveStream", () => {
  it("routes a category to the part of the product that is speaking", () => {
    expect(resolveStream("people_ops_review_digest").senderName).toBe("People Ops");
    expect(resolveStream("attendance_long_shift").senderName).toBe("Attendance");
    expect(resolveStream("delivery_blocker_due").senderName).toBe("Delivery");
    expect(resolveStream("payslip_paid").senderName).toBe("Payroll");
    expect(resolveStream("interview_confirmed").senderName).toBe("Interviews");
  });

  it("prefers an exact match over the prefix rules", () => {
    // employee_* is People Ops, but this one is an election reminder.
    expect(resolveStream("employee_social_lead_selected").senderName).toBe("People Ops");
    expect(resolveStream("am_productivity_digest").senderName).toBe("Productivity");
  });

  it("falls back rather than throwing on a category nobody has classified", () => {
    expect(resolveStream("something_invented_next_quarter")).toBe(DEFAULT_STREAM);
    expect(resolveStream(null)).toBe(DEFAULT_STREAM);
    expect(resolveStream("")).toBe(DEFAULT_STREAM);
  });

  it("gives two different alert kinds different accents", () => {
    expect(resolveStream("people_ops_review_digest").accent).not.toBe(
      resolveStream("attendance_long_shift").accent
    );
  });
});

describe("senderDisplayName", () => {
  it("puts the brand in front of the stream", () => {
    expect(senderDisplayName(resolveStream("people_ops_review_digest"))).toBe(
      "JobGenius People Ops"
    );
  });
});

describe("formatFromHeader", () => {
  it("replaces a bare noreply with a name the inbox list can show", () => {
    expect(formatFromHeader("noreply@job-genius.com", "JobGenius People Ops")).toBe(
      "JobGenius People Ops <noreply@job-genius.com>"
    );
  });

  it("returns the bare address when there is no name", () => {
    expect(formatFromHeader("noreply@job-genius.com")).toBe("noreply@job-genius.com");
    expect(formatFromHeader("noreply@job-genius.com", "   ")).toBe("noreply@job-genius.com");
  });

  it("quotes a name that would otherwise truncate the header", () => {
    const header = formatFromHeader("noreply@job-genius.com", "JobGenius, People Ops");
    expect(header.startsWith('"JobGenius, People Ops"')).toBe(true);
    expect(header.endsWith("<noreply@job-genius.com>")).toBe(true);
  });

  it("leaves an address that already carries a display name alone", () => {
    const preformatted = "Ops <ops@job-genius.com>";
    expect(formatFromHeader(preformatted, "JobGenius Payroll")).toBe(preformatted);
  });
});

describe("absoluteUrl", () => {
  it("makes a stored dashboard path clickable from an inbox", () => {
    expect(absoluteUrl("/dashboard/attendance")).toBe(`${ORIGIN}/dashboard/attendance`);
    expect(absoluteUrl("dashboard/people")).toBe(`${ORIGIN}/dashboard/people`);
  });

  it("passes an already-absolute link straight through", () => {
    expect(absoluteUrl("https://elsewhere.test/x")).toBe("https://elsewhere.test/x");
  });

  it("has nothing to link when there is no path", () => {
    expect(absoluteUrl(null)).toBeNull();
    expect(absoluteUrl("  ")).toBeNull();
  });

  it("falls back to the site URL, which is the one production actually sets", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://job-genius.com";
    try {
      expect(absoluteUrl("/dashboard/people")).toBe("https://job-genius.com/dashboard/people");
    } finally {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  });

  it("drops a trailing slash rather than emitting a doubled one", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://job-genius.com/";
    expect(absoluteUrl("/dashboard/people")).toBe("https://job-genius.com/dashboard/people");
  });
});

describe("derivePreheader", () => {
  it("takes the first line that says something", () => {
    expect(derivePreheader("\n\n2 scorecards due\nmore text", "subject")).toBe(
      "2 scorecards due"
    );
  });

  it("falls back to the subject when the body is empty", () => {
    expect(derivePreheader("", "People Ops review digest")).toBe(
      "People Ops review digest"
    );
  });

  it("trims to something an inbox will actually show", () => {
    const long = "x".repeat(400);
    const result = derivePreheader(long, "subject");
    expect(result.length).toBeLessThanOrEqual(140);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("escapeHtml", () => {
  it("neutralises markup arriving from a database field", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });
});

describe("renderNotificationEmail", () => {
  const digest = () =>
    renderNotificationEmail({
      category: "people_ops_review_digest",
      subject: "People Ops review digest — 24 Aug 2026",
      body: "2 scorecards due\n\n- Scorecards due (2): LAIKA LESLIE AFANYU, ETAH ASHU ELIZABETH TACHE",
      linkUrl: "/dashboard/people",
    });

  it("signs the mail with the stream, not a bare noreply", () => {
    expect(digest().fromName).toBe("JobGenius People Ops");
  });

  it("carries the brand and the stream chip in the header", () => {
    const html = digest().html;
    expect(html).toContain(BRAND.name);
    expect(html).toContain("People Ops");
    expect(html).toContain(resolveStream("people_ops_review_digest").accent);
  });

  it("puts the body's first line in the preheader so the snippet is not the subject", () => {
    const html = digest().html;
    const preheader = html.slice(html.indexOf("mso-hide:all"));
    expect(preheader).toContain("2 scorecards due");
  });

  it("renders a leading-dash block as a list rather than a run-on line", () => {
    expect(digest().html).toContain("<li");
  });

  it("makes the call to action absolute — a relative href is dead in an inbox", () => {
    const html = digest().html;
    expect(html).toContain(`href="${ORIGIN}/dashboard/people"`);
    expect(html).not.toContain('href="/dashboard/people"');
  });

  it("omits the button entirely when there is nowhere to send the reader", () => {
    const rendered = renderNotificationEmail({
      category: "attendance_long_shift",
      subject: "Fidelis Fongum has been signed in for 10h 15m",
      body: "Signed in at 13:54 and has not signed out.",
      linkUrl: null,
    });
    expect(rendered.html).not.toContain("Open Attendance");
    expect(rendered.text).not.toContain("Open Attendance");
    // The footer's own link is not a call to action and still belongs.
    expect(rendered.html).toContain("Manage notifications");
  });

  it("escapes a name that arrives from the database", () => {
    const rendered = renderNotificationEmail({
      category: "people_ops_review_digest",
      subject: "Digest",
      body: 'Scorecards due (1): <script>alert("x")</script>',
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("uses no remote images, which Gmail blocks by default", () => {
    expect(digest().html).not.toContain("<img");
  });

  it("gives two streams visibly different mail", () => {
    const attendance = renderNotificationEmail({
      category: "attendance_long_shift",
      subject: "Castro Koji has been signed in for 23h 2m",
      body: "Castro Koji signed in at 16:41 and has not signed out.",
      linkUrl: "/dashboard/attendance",
    });
    expect(attendance.fromName).not.toBe(digest().fromName);
    expect(attendance.stream.chip).not.toBe(digest().stream.chip);
  });

  it("still produces something sendable with an empty subject and body", () => {
    const rendered = renderNotificationEmail({ category: null, subject: "  ", body: null });
    expect(rendered.subject).toBe("JobGenius update");
    expect(rendered.fromName).toBe("JobGenius Notifications");
    expect(rendered.html).toContain("JobGenius update");
  });
});

describe("People Ops digest wording", () => {
  function snapshot(
    overrides: Partial<PeopleOpsReminderSnapshot> = {}
  ): PeopleOpsReminderSnapshot {
    return {
      currentReviewMonth: "2026-08-01",
      dueScorecardEmployees: [],
      dueProbationSummaries: [],
      pendingOnboardingQueue: [],
      activeDisciplinaryRecords: [],
      electionsClosingSoon: [],
      ...overrides,
    } as PeopleOpsReminderSnapshot;
  }

  const employee = (full_name: string) =>
    ({ id: full_name, worker: { full_name } }) as never;

  it("renders the review month as a month, not as a first-of-month date", () => {
    expect(formatReviewMonth("2026-08-01")).toBe("August 2026");
  });

  it("leaves an unparseable month key alone rather than printing Invalid Date", () => {
    expect(formatReviewMonth("not-a-date")).toBe("not-a-date");
  });

  it("dates the digest by the day it covers, so a month is not one thread", () => {
    expect(formatDigestDay("2026-08-24T00:00:00.000Z")).toBe("24 Aug 2026");
    expect(formatDigestDay("2026-08-24T00:00:00.000Z")).not.toBe(
      formatDigestDay("2026-08-25T00:00:00.000Z")
    );
  });

  it("opens with the counts rather than restating the subject", () => {
    const body = buildManagerDigestBody(
      snapshot({
        dueScorecardEmployees: [employee("LAIKA LESLIE AFANYU"), employee("ETAH ASHU")],
      })
    );
    expect(body.split("\n")[0]).toBe("2 scorecards due");
    expect(body).not.toContain("People Ops review digest for");
  });

  it("drops the sections with nothing in them instead of printing None", () => {
    const body = buildManagerDigestBody(
      snapshot({ dueScorecardEmployees: [employee("LAIKA LESLIE AFANYU")] })
    );
    expect(body).toContain("- Scorecards due (1): LAIKA LESLIE AFANYU");
    expect(body).not.toContain("Onboarding follow-up");
    expect(body).not.toContain("None");
  });

  it("says so plainly when nothing is outstanding", () => {
    expect(buildManagerDigestBody(snapshot()).split("\n")[0]).toBe(
      "Nothing outstanding for August 2026."
    );
  });

  it("still names the review period inside the body", () => {
    expect(
      buildManagerDigestBody(
        snapshot({ dueScorecardEmployees: [employee("LAIKA LESLIE AFANYU")] })
      )
    ).toContain("Review period: August 2026.");
  });
});
