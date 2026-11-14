"use client";

import { useMemo, useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ScrollSelect } from "@/components/scroll-select";
import {
  formatDuesCoverageRange,
  formatDuesMonthPoint,
  monthsFromAmount,
} from "@/lib/dues-months";
import { formatMoney } from "@/lib/format";

type MemberOption = {
  id: number;
  name: string;
  remainingInCurrentYear: number;
  /** Earliest dues year still owing; null when all existing years are full. */
  earliestUnpaidYear: number | null;
  /** Dues-year month index 1–12 (Sep→Aug) for earliest unpaid. */
  earliestUnpaidMonth: number | null;
};

function fillFromLabel(
  year: number | null | undefined,
  month: number | null | undefined,
  fallbackYear: number,
): string {
  if (year != null && month != null) {
    return formatDuesMonthPoint(year, month);
  }
  if (year != null) return String(year);
  return String(fallbackYear);
}

export function RecordDuesForm({
  action,
  scheduleId,
  currentYear,
  monthly,
  today,
  members,
  returnTo = "/dues",
}: {
  action: (formData: FormData) => Promise<void>;
  scheduleId: number;
  currentYear: number;
  monthly: number;
  today: string;
  members: MemberOption[];
  /** @deprecated Year ranges are chosen automatically from earliest unpaid. */
  yearOptions?: number[];
  returnTo?: string;
}) {
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");

  const selected = members.find((m) => String(m.id) === memberId);
  const amountNum = Number(amount);
  const months =
    Number.isFinite(amountNum) && monthly > 0
      ? monthsFromAmount(amountNum, monthly)
      : null;
  const coverageRange =
    selected &&
    months != null &&
    selected.earliestUnpaidYear != null &&
    selected.earliestUnpaidMonth != null
      ? formatDuesCoverageRange(
          selected.earliestUnpaidYear,
          selected.earliestUnpaidMonth,
          months,
        )
      : null;

  const memberOptions = useMemo(() => {
    const ranked = [...members].sort((a, b) => {
      const aPaid = a.remainingInCurrentYear < 12;
      const bPaid = b.remainingInCurrentYear < 12;
      if (aPaid !== bPaid) return aPaid ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return [
      { value: "", label: "Select member", disabled: true },
      ...ranked.map((m) => {
        const paidMonths = 12 - m.remainingInCurrentYear;
        const hasPaid = paidMonths > 0;
        const oweEarlier =
          m.earliestUnpaidYear != null && m.earliestUnpaidYear < currentYear;
        const oweFrom = fillFromLabel(
          m.earliestUnpaidYear,
          m.earliestUnpaidMonth,
          currentYear,
        );
        return {
          value: String(m.id),
          label: `${m.name} · ${paidMonths}/12 in ${currentYear}${
            oweEarlier
              ? ` · owes from ${oweFrom}`
              : m.remainingInCurrentYear > 0
                ? ` · up to ${formatMoney(m.remainingInCurrentYear * monthly)}`
                : " · year full"
          }`,
          searchText: m.name,
          group: hasPaid ? "Paid this year" : "No payments yet",
        };
      }),
    ];
  }, [members, currentYear, monthly]);

  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="dues_schedule_id" value={scheduleId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <label className="field">
        Member
        <ScrollSelect
          name="member_id"
          required
          searchable
          searchPlaceholder="Search member…"
          value={memberId}
          placeholder="Select member"
          onChange={setMemberId}
          options={memberOptions}
        />
      </label>
      <label className="field">
        Amount paid (₦)
        <input
          name="amount"
          type="number"
          min={monthly}
          step={monthly || 0.01}
          required
          placeholder={String(monthly || "0.00")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <p className="muted" style={{ margin: 0 }}>
        Must be a multiple of {formatMoney(monthly)}. Example:{" "}
        {formatMoney(monthly * 3)} covers 3 months. Full year ={" "}
        {formatMoney(monthly * 12)}.
        {months != null
          ? ` This amount covers ${months} month${months === 1 ? "" : "s"}.`
          : ""}
      </p>
      {selected && coverageRange ? (
        <p className="muted" style={{ margin: 0 }}>
          {selected.name}&apos;s payment covers {coverageRange}.
        </p>
      ) : null}

      <label className="field">
        Payment date
        <input
          name="payment_date"
          type="date"
          required
          max={today}
          defaultValue={today}
        />
      </label>
      <label className="field">
        Notes (optional)
        <textarea
          name="notes"
          rows={2}
          placeholder="Bank transfer ref, cash collector, etc."
        />
      </label>
      <PendingSubmitButton
        idleLabel="Save dues payment"
        pendingLabel="Saving…"
      />
    </form>
  );
}
