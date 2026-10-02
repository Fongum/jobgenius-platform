// ============================================================
// How the daily People Ops digest reads.
//
// Pure by design — no Supabase, no request — so the wording can be
// tested directly, the same way lib/long-shift-alerts.ts is.
//
// Two things here are inbox decisions rather than copy decisions:
//   - The body's first line is the snippet Gmail shows next to the
//     subject. It carries the counts, because it used to restate the
//     subject and that made a month of digests look like one repeated
//     row.
//   - Sections with nothing in them are dropped instead of printing
//     "None", so the length of the mail tracks how much is actually due.
// ============================================================

import type { PeopleOpsReminderSnapshot } from "@/lib/people-server";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Date pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date pending";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** "August 2026" — the review period, not the raw 2026-08-01 month key. */
export function formatReviewMonth(monthKey: string): string {
  const parsed = new Date(`${monthKey}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return monthKey;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "24 Aug 2026" — the day this digest covers, so each day is its own thread. */
export function formatDigestDay(dayStartIso: string): string {
  const parsed = new Date(dayStartIso);
  if (Number.isNaN(parsed.getTime())) return dayStartIso.slice(0, 10);
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function summarizeList(values: string[], limit = 5): string {
  if (values.length === 0) return "None";
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")}, and ${values.length - limit} more`;
}

export function getEmployeeDisplayName(input: {
  worker?: { full_name?: string | null; job_title?: string | null } | null;
  role_title?: string | null;
  account_manager?: { name?: string | null; email?: string | null } | null;
  id?: string | null;
}): string {
  return (
    input.worker?.full_name ||
    input.account_manager?.name ||
    input.role_title ||
    input.worker?.job_title ||
    input.account_manager?.email ||
    input.id ||
    "Unknown employee"
  );
}

export function buildManagerDigestBody(snapshot: PeopleOpsReminderSnapshot) {
  const scorecardNames = snapshot.dueScorecardEmployees.map((employee) =>
    getEmployeeDisplayName(employee)
  );
  const probationNames = snapshot.dueProbationSummaries.map((summary) =>
    `${getEmployeeDisplayName(summary.employee)} (Month ${summary.dueCheckpoint})`
  );
  const onboardingNames = snapshot.pendingOnboardingQueue.map((form) => form.full_name);
  const disciplinaryNames = snapshot.activeDisciplinaryRecords.map((record) =>
    `${getEmployeeDisplayName(record.employee ?? { id: record.employee_id })} - ${record.title}`
  );
  const electionNames = snapshot.electionsClosingSoon.map((election) => {
    const closingAt =
      election.status === "nominations_open"
        ? election.nominations_close_at
        : election.voting_close_at;
    return `${election.title} (${formatDateTime(closingAt)})`;
  });

  const sections: Array<[string, string[], number]> = [
    ["Scorecards due", scorecardNames, 5],
    ["Probation checkpoints due", probationNames, 5],
    ["Onboarding follow-up", onboardingNames, 5],
    ["Active disciplinary records", disciplinaryNames, 5],
    ["Elections closing soon", electionNames, 3],
  ];
  const open = sections.filter(([, names]) => names.length > 0);

  // The headline is what the inbox shows as the preview. It used to restate
  // the subject, which is why a month of digests read as one repeated row.
  const headline =
    open.length === 0
      ? `Nothing outstanding for ${formatReviewMonth(snapshot.currentReviewMonth)}.`
      : open
          .map(([label, names]) => `${names.length} ${label.toLowerCase()}`)
          .join(", ");

  return [
    headline,
    "",
    ...open.map(
      ([label, names, limit]) =>
        `- ${label} (${names.length}): ${summarizeList(names, limit)}`
    ),
    "",
    `Review period: ${formatReviewMonth(snapshot.currentReviewMonth)}.`,
    "Open the People Ops dashboard to review and action these items.",
  ].join("\n");
}
