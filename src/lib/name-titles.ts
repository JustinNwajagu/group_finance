/** Honorific titles offered on create-account requests. */
export const NAME_TITLES = ["Mr", "Dr", "Engr", "Chief", "Sir"] as const;

export type NameTitle = (typeof NAME_TITLES)[number];

export function isNameTitle(value: string): value is NameTitle {
  return (NAME_TITLES as readonly string[]).includes(value);
}

export function formatTitledName(title: string | null | undefined, name: string): string {
  const cleanName = name.trim();
  const cleanTitle = (title ?? "").trim();
  if (!cleanTitle) return cleanName;
  if (!cleanName) return cleanTitle;
  return `${cleanTitle} ${cleanName}`;
}
