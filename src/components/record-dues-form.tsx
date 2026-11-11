"use client";

import { useMemo, useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { monthsFromAmount } from "@/lib/dues-months";
import { formatMoney } from "@/lib/format";

type MemberOption = {
  id: number;
  name: string;
  remainingInCurrentYear: number;
};

export function RecordDuesForm({
  action,
  scheduleId,
  currentYear,
  monthly,
  today,
  members,
  yearOptions,
  returnTo = "/dues",
}: {
  action: (formData: FormData) => Promise<void>;
  scheduleId: number;
  currentYear: number;
  monthly: number;
  today: string;
  members: MemberOption[];
  yearOptions: number[];
  returnTo?: string;
}) {
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [yearFrom, setYearFrom] = useState(String(currentYear));
  const [yearTo, setYearTo] = useState(String(currentYear));

  const selected = members.find((m) => String(m.id) === memberId);
  const remaining = selected?.remainingInCurrentYear ?? 0;
  const amountNum = Number(amount);
  const months =
    Number.isFinite(amountNum) && monthly > 0
      ? monthsFromAmount(amountNum, monthly)
      : null;
  const needsYearRange =
    months != null && (months > remaining || months > 12);

  const years = useMemo(() => {
    const set = new Set(yearOptions);
    set.add(currentYear);
    // Offer nearby years so admin can span past/future even before opening them.
    for (let y = currentYear - 5; y <= currentYear + 5; y += 1) set.add(y);
    return [...set].sort((a, b) => a - b);
  }, [yearOptions, currentYear]);

  function suggestYearRange(nextMonths: number | null, nextRemaining: number) {
    if (nextMonths == null) return;
    if (nextMonths > 12) {
      setYearFrom(String(currentYear));
      setYearTo(String(currentYear + Math.ceil(nextMonths / 12) - 1));
      return;
    }
    if (nextMonths > nextRemaining) {
      const overflow = nextMonths - nextRemaining;
      setYearFrom(String(currentYear));
      setYearTo(String(currentYear + Math.max(1, Math.ceil(overflow / 12))));
    }
  }

  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="dues_schedule_id" value={scheduleId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <label className="field">
        Member
        <select
          name="member_id"
          required
          value={memberId}
          onChange={(e) => {
            const nextId = e.target.value;
            setMemberId(nextId);
            const nextRemaining =
              members.find((m) => String(m.id) === nextId)
                ?.remainingInCurrentYear ?? 0;
            suggestYearRange(months, nextRemaining);
          }}
        >
          <option value="" disabled>
            Select member
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {12 - m.remainingInCurrentYear}/12 in {currentYear}
              {m.remainingInCurrentYear > 0
                ? ` · up to ${formatMoney(m.remainingInCurrentYear * monthly)}`
                : " · year full"}
            </option>
          ))}
        </select>
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
          onChange={(e) => {
            const next = e.target.value;
            setAmount(next);
            const nextMonths =
              Number.isFinite(Number(next)) && monthly > 0
                ? monthsFromAmount(Number(next), monthly)
                : null;
            suggestYearRange(nextMonths, remaining);
          }}
        />
      </label>
      <p className="muted" style={{ margin: 0 }}>
        Must be a multiple of {formatMoney(monthly)}. Example:{" "}
        {formatMoney(monthly * 3)} covers 3 months. Full year ={" "}
        {formatMoney(monthly * 12)}.
        {months != null ? ` This amount covers ${months} month${months === 1 ? "" : "s"}.` : ""}
      </p>

      {needsYearRange ? (
        <div className="form-grid two">
          <label className="field">
            Apply from year
            <select
              name="year_from"
              required
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Through year
            <select
              name="year_to"
              required
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ margin: 0, gridColumn: "1 / -1" }}>
            This payment exceeds what fits in {currentYear}
            {selected ? ` for ${selected.name}` : ""}. Choose the year range to
            split months across (past or future). Missing years are opened
            automatically at {formatMoney(monthly)}/month.
          </p>
        </div>
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
