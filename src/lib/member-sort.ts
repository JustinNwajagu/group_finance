/** Honorifics used on the SHSN / KLEF roster. */
const TITLE_PREFIX =
  /^(mr|mrs|ms|miss|fr|dr|engr|barr|rev|prof)\.?\s+/i;

/** Name key for alphabetical sort (ignores title prefix). */
export function memberSortKey(name: string): string {
  return name.replace(TITLE_PREFIX, "").trim();
}

export function compareMembersByName(
  a: { name: string },
  b: { name: string },
): number {
  const byKey = memberSortKey(a.name).localeCompare(
    memberSortKey(b.name),
    undefined,
    { sensitivity: "base" },
  );
  if (byKey !== 0) return byKey;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
