// ============================================================
// Placement fee (commission) computation — Client Collaboration Agreement §7/§8.
//
//   fee  = rate × (base salary + guaranteed cash compensation)
//          rate = 5% Essentials/Premium, 3.5% Recurring (the rate the client signed)
//   due  = 2 months after the employment START date
//   ext  = 3 months after the employment START date (approved extension)
//
// When the start date is unknown, the offer-acceptance date is used as the
// anchor. Extracted as a pure function so the money math is unit-tested.
// ============================================================

export const PLACEMENT_FEE_RATE = 0.05;

export interface PlacementFee {
  commissionAmount: number;
  /** Rate applied, e.g. 0.05. */
  rate: number;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  /** ISO date (YYYY-MM-DD). */
  extendedDueDate: string;
}

export function computePlacementFee(input: {
  baseSalary: number;
  guaranteedCompensation?: number | null;
  /** Employment start date (preferred anchor). */
  startDate?: string | null;
  /** Offer-acceptance date (fallback anchor). */
  offerAcceptedAt: string;
  /** Success-fee rate the client signed. Defaults to 5%. */
  rate?: number | null;
}): PlacementFee {
  const guaranteed = Number(input.guaranteedCompensation) || 0;
  const rate = Number(input.rate) > 0 ? Number(input.rate) : PLACEMENT_FEE_RATE;
  const commissionAmount =
    Math.round((Number(input.baseSalary) + guaranteed) * rate * 100) / 100;

  const anchor = new Date(input.startDate ?? input.offerAcceptedAt);
  const dueDate = new Date(anchor);
  dueDate.setMonth(dueDate.getMonth() + 2);
  const extendedDueDate = new Date(anchor);
  extendedDueDate.setMonth(extendedDueDate.getMonth() + 3);

  return {
    commissionAmount,
    rate,
    dueDate: dueDate.toISOString().split("T")[0],
    extendedDueDate: extendedDueDate.toISOString().split("T")[0],
  };
}

/** "5%" / "3.5%" */
export function formatFeeRate(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}
