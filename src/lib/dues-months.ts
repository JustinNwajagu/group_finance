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
