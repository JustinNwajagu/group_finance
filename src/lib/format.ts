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

export function formatExpenseKind(
  kind: "member" | "miscellaneous" | "meeting",
): string {
  if (kind === "member") return "Member";
  if (kind === "meeting") return "Meeting";
  return "Miscellaneous";
}

export function formatExpenseFunding(input: {
  funding_source: "contribution" | "bank" | "both" | null;
  contribution_title?: string | null;
  contribution_amount?: string | number | null;
  bank_amount?: string | number | null;
}): string {
  const title = input.contribution_title?.trim() || "Contribution";
  const contribution = Number(input.contribution_amount ?? 0);
  const bank = Number(input.bank_amount ?? 0);
  if (input.funding_source === "both") {
    return `${title} ${formatMoney(contribution)} + bank ${formatMoney(bank)}`;
  }
  if (input.funding_source === "contribution") return title;
  if (input.funding_source === "bank") return "Bank balance";
  return "—";
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

/** Calendar date in local machine timezone as YYYY-MM-DD. */
export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True when value is YYYY-MM-DD and not after today. */
export function isPaymentDateAllowed(
  value: string,
  today = todayIsoDate(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return value <= today;
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
