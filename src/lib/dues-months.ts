/** Dues-year months in order: Sept → Aug (index 1 … 12). */
export const DUES_MONTH_LABELS = [
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
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

/** Money already attributed to each dues-year month Sep→Aug (length 12). */
export function monthCreditsFromPayments(
  payments: Array<{ amount: string | number; covered_months: number[] }>,
): number[] {
  const credits = Array.from({ length: 12 }, () => 0);
  for (const p of payments) {
    const months = p.covered_months.filter((m) => m >= 1 && m <= 12);
    if (months.length === 0) continue;
    const share = Number(p.amount) / months.length;
    if (!Number.isFinite(share) || share <= 0) continue;
    for (const m of months) credits[m - 1] += share;
  }
  return credits.map((c) => Number(c.toFixed(2)));
}

/** True when a month's credited amount meets the monthly due. */
export function monthsFullyPaidFromCredits(
  credits: number[],
  monthlyAmount: number,
): boolean[] {
  const monthly = Number(monthlyAmount);
  return Array.from({ length: 12 }, (_, i) => {
    const credit = credits[i] ?? 0;
    if (!Number.isFinite(monthly) || monthly <= 0) return credit > 0;
    return credit + 0.009 >= monthly;
  });
}

/** Next months that are not yet fully paid, up to `count`. */
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

/** First month that still needs money toward the monthly due. */
export function nextPartialMonth(
  credits: number[],
  monthlyAmount: number,
): number | null {
  const monthly = Number(monthlyAmount);
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  for (let i = 0; i < 12; i += 1) {
    const credit = credits[i] ?? 0;
    if (credit + 0.009 < monthly) return i + 1;
  }
  return null;
}

export type YearMonthAllocation = {
  year: number;
  covered_months: number[];
  /** Money applied to this year for these months. */
  amount: number;
  /** True when this slice only partly pays one month. */
  partial?: boolean;
};

export type EarliestUnpaidPoint = {
  /** Dues-year label (Sept start year). */
  year: number;
  /** Dues-year month index 1–12 (Sep→Aug). */
  month: number;
};

/**
 * Earliest unpaid dues month across years (ascending).
 * Years with no monthly rate are skipped. Returns null when every listed year
 * is fully paid (or the list is empty).
 */
export function earliestUnpaidPoint(
  years: number[],
  creditsByYear: Map<number, number[]>,
  monthlyByYear: Map<number, number>,
): EarliestUnpaidPoint | null {
  const sorted = [...new Set(years)]
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  const emptyCredits = () => Array.from({ length: 12 }, () => 0);
  for (const year of sorted) {
    const monthly = Number(monthlyByYear.get(year) ?? 0);
    if (!Number.isFinite(monthly) || monthly <= 0) continue;
    const credits = creditsByYear.get(year) ?? emptyCredits();
    const paid = monthsFullyPaidFromCredits(credits, monthly);
    const month = paid.findIndex((v) => !v) + 1;
    if (month >= 1) return { year, month };
  }
  return null;
}

/**
 * Earliest dues year (ascending) that still has an unpaid month for this member.
 */
export function earliestUnpaidYear(
  years: number[],
  creditsByYear: Map<number, number[]>,
  monthlyByYear: Map<number, number>,
): number | null {
  return earliestUnpaidPoint(years, creditsByYear, monthlyByYear)?.year ?? null;
}

/** e.g. dues year 2023 month 1 → "Sep 2023"; month 5 → "Jan 2024". */
export function formatDuesMonthPoint(year: number, month: number): string {
  if (month < 1 || month > 12) return String(year);
  const label = DUES_MONTH_LABELS[month - 1];
  const calendarYear = month <= 4 ? year : year + 1;
  return `${label} ${calendarYear}`;
}

/**
 * Last dues month covered when filling `monthCount` months starting at
 * (year, month) inclusive, advancing Sep→Aug across years.
 */
export function duesCoverageEnd(
  year: number,
  month: number,
  monthCount: number,
): EarliestUnpaidPoint {
  let y = year;
  let m = month;
  const steps = Math.max(1, Math.floor(monthCount));
  for (let i = 1; i < steps; i += 1) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return { year: y, month: m };
}

/** Human range for a contiguous dues fill, e.g. "Sep 2023 to Nov 2023". */
export function formatDuesCoverageRange(
  startYear: number,
  startMonth: number,
  monthCount: number,
): string {
  const from = formatDuesMonthPoint(startYear, startMonth);
  if (monthCount <= 1) return from;
  const end = duesCoverageEnd(startYear, startMonth, monthCount);
  const to = formatDuesMonthPoint(end.year, end.month);
  if (from === to) return from;
  return `${from} to ${to}`;
}

/**
 * Split a payment amount across years in [yearFrom, yearTo].
 * Each year uses its own monthly due. Full months are filled first within the
 * selected range only. Any leftover balance becomes a partial payment on the
 * next incomplete month in the range.
 */
export function allocateAmountAcrossYearRange(
  creditsByYear: Map<number, number[]>,
  monthlyByYear: Map<number, number>,
  yearFrom: number,
  yearTo: number,
  amount: number,
): YearMonthAllocation[] | null {
  if (
    !Number.isFinite(yearFrom) ||
    !Number.isFinite(yearTo) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }
  const start = Math.min(yearFrom, yearTo);
  const end = Math.max(yearFrom, yearTo);
  const emptyCredits = () => Array.from({ length: 12 }, () => 0);
  const allocations: YearMonthAllocation[] = [];
  let remainingMoney = Number(amount.toFixed(2));

  for (let year = start; year <= end && remainingMoney > 0.009; year += 1) {
    const monthly = Number(monthlyByYear.get(year) ?? 0);
    if (!Number.isFinite(monthly) || monthly <= 0) return null;
    const credits = [...(creditsByYear.get(year) ?? emptyCredits())];
    const paid = monthsFullyPaidFromCredits(credits, monthly);
    const unpaid = paid.filter((v) => !v).length;
    if (unpaid <= 0) continue;

    const affordable = Math.floor((remainingMoney + 0.009) / monthly);
    if (affordable >= 1) {
      const take = Math.min(unpaid, affordable);
      const covered = takeNextUnpaidMonths(paid, take);
      if (covered.length > 0) {
        const slice = Number((covered.length * monthly).toFixed(2));
        allocations.push({
          year,
          covered_months: covered,
          amount: slice,
        });
        for (const m of covered) {
          credits[m - 1] = Number(((credits[m - 1] ?? 0) + monthly).toFixed(2));
        }
        creditsByYear.set(year, credits);
        remainingMoney = Number((remainingMoney - slice).toFixed(2));
      }
    }

    if (remainingMoney > 0.009) {
      const refreshed = monthsFullyPaidFromCredits(credits, monthly);
      const partialMonth = nextPartialMonth(credits, monthly);
      if (partialMonth == null || refreshed[partialMonth - 1]) continue;
      const already = credits[partialMonth - 1] ?? 0;
      const need = Number((monthly - already).toFixed(2));
      if (need <= 0.009) continue;
      const partialAmount = Number(Math.min(remainingMoney, need).toFixed(2));
      if (partialAmount <= 0.009) continue;
      allocations.push({
        year,
        covered_months: [partialMonth],
        amount: partialAmount,
        partial: partialAmount + 0.009 < need,
      });
      credits[partialMonth - 1] = Number(
        (already + partialAmount).toFixed(2),
      );
      creditsByYear.set(year, credits);
      remainingMoney = Number((remainingMoney - partialAmount).toFixed(2));
    }
  }

  if (remainingMoney > 0.009) return null;
  if (allocations.length === 0) return null;
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
