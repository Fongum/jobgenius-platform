// ============================================================
// What an account manager is actually carrying.
//
// Capacity was counted in clients, which treats a client still quietly
// applying as equal to one in final-round interviews with an offer
// pending. They are not close to equal, and paying or promoting on
// headcount rewards whoever holds the most idle clients.
//
// ─── Load is not throughput ──────────────────────────────────────────────
//
// Two different questions get confused here and they need separate
// answers:
//
//   LOAD       how busy is this person right now — an input to whoever
//              assigns the next client.
//   THROUGHPUT how much did this person get done over a quarter — an
//              input to promotion.
//
// This module answers the first. Instantaneous load must never decide a
// promotion, and a quarter's throughput must never decide today's
// assignment. Keeping them apart is most of the value here.
//
// ─── What this cannot see ────────────────────────────────────────────────
//
// A ninety-minute call talking an anxious client through a rejection
// leaves no row in any table. Resume rewrites, resetting unrealistic
// expectations, the third conversation about a role they didn't get —
// none of it is countable, and it is disproportionately what separates a
// good consultant from an adequate one.
//
// So the computed figure is paired with a high-touch override that a
// people manager confirms. Not self-serve, because it affects capacity
// and therefore pay — but available, because a metric that silently
// punishes the most attentive people is worse than no metric.
// ============================================================

export const CLIENT_STAGES = [
  "onboarding",
  "applying",
  "interviewing",
  "offer",
  "dormant",
] as const;

export type ClientStage = (typeof CLIENT_STAGES)[number];

export function isClientStage(value: unknown): value is ClientStage {
  return typeof value === "string" && CLIENT_STAGES.includes(value as ClientStage);
}

/**
 * Weights are illustrative starting points, NOT measurements. They are
 * deliberately easy to change because the right values should come from
 * the data: compare logged hours against stage mix over a quarter and the
 * real weights fall out. Until then these encode the obvious ordering —
 * interviewing is the heavy stage, applying is largely automated by the
 * runner, dormant still costs something because re-engagement is work.
 */
export const STAGE_WEIGHTS: Record<ClientStage, number> = {
  onboarding: 2.0,
  applying: 1.0,
  interviewing: 3.0,
  offer: 2.5,
  dormant: 0.5,
};

export const STAGE_LABELS: Record<ClientStage, string> = {
  onboarding: "Onboarding",
  applying: "Applying",
  interviewing: "Interviewing",
  offer: "Offer stage",
  dormant: "Dormant",
};

/** Extra weight added by a confirmed high-touch flag. */
export const HIGH_TOUCH_SURCHARGE = 1.5;

export type ClientLoadInput = {
  job_seeker_id: string;
  stage: ClientStage;
  /** Confirmed by a people manager, never self-serve. */
  high_touch?: boolean;
};

export type ClientLoadDetail = ClientLoadInput & {
  weight: number;
};

export type AmLoad = {
  account_manager_id: string;
  am_name: string;
  clients: ClientLoadDetail[];
  /** Headcount, kept for comparison — it is what people expect to see. */
  headcount: number;
  /** The number that actually matters. */
  load: number;
  /** load ÷ capacity, or null when no capacity is set. */
  utilisation: number | null;
  capacity: number | null;
  byStage: Record<ClientStage, number>;
};

export function weightFor(client: ClientLoadInput): number {
  const base = STAGE_WEIGHTS[client.stage] ?? STAGE_WEIGHTS.applying;
  return client.high_touch ? base + HIGH_TOUCH_SURCHARGE : base;
}

function emptyByStage(): Record<ClientStage, number> {
  return {
    onboarding: 0,
    applying: 0,
    interviewing: 0,
    offer: 0,
    dormant: 0,
  };
}

/** Round to one decimal — load is an estimate, not an accounting figure. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeAmLoad(
  accountManagerId: string,
  amName: string,
  clients: ClientLoadInput[],
  capacity: number | null = null
): AmLoad {
  const details = clients.map((client) => ({
    ...client,
    weight: weightFor(client),
  }));

  const byStage = emptyByStage();
  for (const client of clients) {
    if (isClientStage(client.stage)) byStage[client.stage] += 1;
  }

  const load = round1(details.reduce((sum, client) => sum + client.weight, 0));

  return {
    account_manager_id: accountManagerId,
    am_name: amName,
    clients: details,
    headcount: clients.length,
    load,
    capacity,
    utilisation:
      capacity !== null && capacity > 0 ? round1(load / capacity) : null,
  byStage,
  };
}

/**
 * Whether this AM can take another client of a given stage without going
 * over capacity. New clients arrive at `onboarding`, which is heavy — so
 * an AM sitting just under capacity genuinely cannot absorb one, and
 * headcount would have said they could.
 */
export function canAbsorb(
  amLoad: AmLoad,
  incomingStage: ClientStage = "onboarding"
): boolean {
  if (amLoad.capacity === null) return true;
  return amLoad.load + STAGE_WEIGHTS[incomingStage] <= amLoad.capacity;
}

/**
 * Who should get the next client: the lowest load with room, not the
 * lowest headcount. Ties break on headcount so an AM carrying three heavy
 * clients is preferred over one carrying six light ones at equal load —
 * the second is closer to a stage change tipping them over.
 */
export function nextAssignee(
  loads: AmLoad[],
  incomingStage: ClientStage = "onboarding"
): AmLoad | null {
  const eligible = loads.filter((entry) => canAbsorb(entry, incomingStage));
  if (eligible.length === 0) return null;

  return eligible.reduce((best, entry) => {
    if (entry.load !== best.load) return entry.load < best.load ? entry : best;
    if (entry.headcount !== best.headcount) {
      return entry.headcount < best.headcount ? entry : best;
    }
    return entry.am_name.localeCompare(best.am_name) < 0 ? entry : best;
  });
}

// ─── Deriving a stage ────────────────────────────────────────────────────

export type StageEvidence = {
  /** An accepted or pending offer exists. */
  hasOpenOffer?: boolean;
  /** Interviews scheduled or held recently. */
  upcomingInterviews?: number;
  /** Application runs in the recent window. */
  recentApplications?: number;
  /** Days since the client joined. */
  daysSinceOnboarded?: number | null;
  /** Days since anything at all happened for this client. */
  daysSinceActivity?: number | null;
};

/** A client with no activity for this long has gone quiet. */
export const DORMANT_AFTER_DAYS = 21;
/** How long a new client counts as onboarding. */
export const ONBOARDING_DAYS = 14;

/**
 * Derive a stage from what the platform recorded. Ordered by precedence:
 * an offer outranks interviews, which outrank applying. Dormancy is
 * checked before applying but after the active stages — someone with an
 * interview next week is not dormant however quiet the last fortnight was.
 */
export function deriveStage(evidence: StageEvidence): ClientStage {
  if (evidence.hasOpenOffer) return "offer";
  if ((evidence.upcomingInterviews ?? 0) > 0) return "interviewing";

  const since = evidence.daysSinceActivity;
  if (since !== null && since !== undefined && since >= DORMANT_AFTER_DAYS) {
    return "dormant";
  }

  const age = evidence.daysSinceOnboarded;
  if (age !== null && age !== undefined && age <= ONBOARDING_DAYS) {
    return "onboarding";
  }

  return "applying";
}

export function formatLoad(load: number): string {
  return load.toFixed(1);
}
