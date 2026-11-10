export const DUES_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type DuesMonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * How many whole months an amount covers at the fixed monthly due.
 * Returns null when amount is not a positive multiple of the monthly due.
 */
export function monthsFromAmount(
  amount: number,
  monthlyAmount: number,
): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(monthlyAmount)) return null;
  if (amount <= 0 || monthlyAmount <= 0) return null;
  const months = Math.round(amount / monthlyAmount);
  if (months < 1) return null;
  const expected = months * monthlyAmount;
  if (Math.abs(expected - amount) > 0.009) return null;
  return months;
}

/** Next unpaid month numbers in Jan–Dec order, up to `count`. */
export function takeNextUnpaidMonths(
  paid: boolean[],
  count: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < 12 && out.length < count; i += 1) {
    if (!paid[i]) out.push(i + 1);
  }
  return out;
}

export type YearMonthAllocation = {
  year: number;
  covered_months: number[];
};

/**
 * Split `months` across years in [yearFrom, yearTo], filling unpaid months
 * chronologically (earlier years first, Jan→Dec within each year).
 */
export function allocateMonthsAcrossYearRange(
  paidByYear: Map<number, boolean[]>,
  yearFrom: number,
  yearTo: number,
  months: number,
): YearMonthAllocation[] | null {
  if (
    !Number.isFinite(yearFrom) ||
    !Number.isFinite(yearTo) ||
    !Number.isFinite(months) ||
    months < 1
  ) {
    return null;
  }
  const start = Math.min(yearFrom, yearTo);
  const end = Math.max(yearFrom, yearTo);
  const empty = () => Array.from({ length: 12 }, () => false);
  const allocations: YearMonthAllocation[] = [];
  let remaining = months;

  for (let year = start; year <= end && remaining > 0; year += 1) {
    const paid = paidByYear.get(year) ?? empty();
    const covered = takeNextUnpaidMonths(paid, remaining);
    if (covered.length === 0) continue;
    allocations.push({ year, covered_months: covered });
    // Mark taken months so later logic could reuse the map if needed.
    for (const m of covered) paid[m - 1] = true;
    paidByYear.set(year, paid);
    remaining -= covered.length;
  }

  if (remaining > 0) return null;
  return allocations;
}

/**
 * Fractional dues credit for one year: monthsPaid/12.
 * A fully paid year counts as 1.
 */
export function duesYearFraction(monthsPaid: number): number {
  const n = Math.max(0, Math.min(12, Math.round(monthsPaid)));
  return n / 12;
}

/** Display fractional dues totals without noisy trailing zeros. */
export function formatDuesCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded
    .toFixed(3)
    .replace(/\.?0+$/, "");
}

/** Compact label for covered months, e.g. "Jan–Mar" or "Jan, Mar". */
export function formatCoveredMonths(months: number[]): string {
  const labels = [...months]
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b)
    .map((m) => DUES_MONTH_LABELS[m - 1]);
  if (labels.length === 0) return "—";
  if (labels.length === 1) return labels[0];
  const sorted = [...months].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  if (contiguous) return `${labels[0]}–${labels[labels.length - 1]}`;
  return labels.join(", ");
}
