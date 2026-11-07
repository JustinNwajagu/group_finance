import type { PaymentWithMember } from "./types";

export type PaymentTitleGroup<T extends { title: string; amount: string }> = {
  title: string;
  payments: T[];
  total: number;
};

export function groupPaymentsByTitle<T extends { title: string; amount: string }>(
  payments: T[],
): PaymentTitleGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const payment of payments) {
    const key = payment.title.trim() || "Untitled";
    const list = map.get(key);
    if (list) list.push(payment);
    else map.set(key, [payment]);
  }

  const groups: PaymentTitleGroup<T>[] = [...map.entries()].map(
    ([title, items]) => ({
      title,
      payments: items,
      total: items.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    }),
  );

  groups.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  return groups;
}
