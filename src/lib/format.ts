/** Collapse accidental repeats like "Levy - Levy" from filename stems. */
export function normalizePaymentTitle(title: string): string {
  const cleaned = title.trim().replace(/\s+/g, " ");
  if (!cleaned) return cleaned;
  const parts = cleaned.split(/\s[-–—]\s/).map((p) => p.trim()).filter(Boolean);
  if (
    parts.length === 2 &&
    parts[0].toLowerCase() === parts[1].toLowerCase()
  ) {
    return parts[0];
  }
  return cleaned;
}

export function formatMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "₦0.00";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const raw = value.includes("T") ? value : `${value}T12:00:00`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
