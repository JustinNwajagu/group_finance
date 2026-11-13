/** Canonical dues-year title: Sept of year → Aug of year+1. */
export function duesYearTitle(year: number): string {
  return `${year} Dues (Sept ${year}–Aug ${year + 1})`;
}

/** Rewrite legacy “Sept–Sept” titles to Sept–Aug. */
export function normalizeDuesYearTitle(title: string, year?: number): string {
  const trimmed = title.trim();
  const fixed = trimmed.replace(
    /\(Sept\s+(\d{4})\s*[–-]\s*Sept\s+(\d{4})\)/gi,
    (_match, start: string, end: string) => `(Sept ${start}–Aug ${end})`,
  );
  if (fixed !== trimmed) return fixed;
  if (year && (!trimmed || /^\d{4}\s*dues$/i.test(trimmed))) {
    return duesYearTitle(year);
  }
  return trimmed;
}
