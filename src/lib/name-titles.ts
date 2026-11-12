/** Honorific titles offered on create-account requests. */
export const NAME_TITLES = ["Mr", "Dr", "Engr", "Chief", "Sir"] as const;

export type NameTitle = (typeof NAME_TITLES)[number];

/** Titles / honorifics stripped before comparing personal name tokens. */
const NAME_NOISE = new Set(
  [
    ...NAME_TITLES,
    "mrs",
    "miss",
    "ms",
    "rev",
    "fr",
    "father",
    "pastor",
    "hon",
    "prof",
    "professor",
    "md",
    "jr",
    "sr",
  ].map((t) => t.toLowerCase()),
);

export function isNameTitle(value: string): value is NameTitle {
  return (NAME_TITLES as readonly string[]).includes(value);
}

/** Ensure a title ends with a single trailing dot (Mr → Mr.). */
export function formatTitleWithDot(title: string | null | undefined): string {
  const clean = (title ?? "").trim();
  if (!clean) return "";
  return clean.endsWith(".") ? clean : `${clean}.`;
}

export function formatTitledName(title: string | null | undefined, name: string): string {
  const cleanName = name.trim();
  const dottedTitle = formatTitleWithDot(title);
  if (!dottedTitle) return cleanName;
  if (!cleanName) return dottedTitle;
  return `${dottedTitle} ${cleanName}`;
}

/**
 * For free-text roster names, ensure a leading known title ends with "."
 * e.g. "Mr Udeoba Donald" → "Mr. Udeoba Donald".
 */
export function ensureLeadingTitleDot(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return clean;
  const match = clean.match(/^([A-Za-z]+)\.?\s+(.+)$/);
  if (!match) return clean;
  const rawTitle = match[1];
  const rest = match[2];
  const known = NAME_TITLES.find(
    (t) => t.toLowerCase() === rawTitle.toLowerCase(),
  );
  if (!known) return clean;
  return `${formatTitleWithDot(known)} ${rest}`;
}

/** Split a display name into comparable personal-name tokens. */
export function nameTokens(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/[\s'-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !NAME_NOISE.has(part));
}

/**
 * True when at least one personal name token appears in both strings
 * (e.g. request “Donald Chisom” can link to roster “Mr Udeoba Donald”).
 */
export function namesShareAToken(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = nameTokens(left);
  const b = new Set(nameTokens(right));
  if (a.length === 0 || b.size === 0) return false;
  return a.some((token) => b.has(token));
}
