"use client";

import { useMemo, useState } from "react";
import { recordExpense } from "@/app/actions/expenses";
import { FormBusyMarker } from "@/components/action-form";
import {
  FormPendingStatus,
  PendingSubmitButton,
} from "@/components/pending-submit-button";
import { formatMoney } from "@/lib/format";
import type { ContributionFundingOption, Member } from "@/lib/types";

type FundingSource = "contribution" | "bank";

/** Split `total` across `count` parts; leftover cents go to the last part. */
function splitAmount(total: number, count: number): string[] {
  if (count <= 0 || !Number.isFinite(total) || total <= 0) {
    return Array.from({ length: Math.max(count, 0) }, () => "");
  }
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const parts = Array.from({ length: count }, () => base);
  let leftover = cents - base * count;
  for (let i = parts.length - 1; i >= 0 && leftover > 0; i -= 1) {
    parts[i]! += 1;
    leftover -= 1;
  }
  return parts.map((c) => (c / 100).toFixed(2));
}

export function RecordExpenseForm({
  members,
  contributions,
  today,
  bankBalance,
}: {
  members: Member[];
  contributions: ContributionFundingOption[];
  today: string;
  bankBalance: string;
}) {
  const [kind, setKind] = useState<"miscellaneous" | "member">("miscellaneous");
  const [funding, setFunding] = useState<FundingSource>("contribution");
  const [contributionId, setContributionId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [amountByMember, setAmountByMember] = useState<Record<number, string>>(
    {},
  );

  const selectedContribution = useMemo(
    () =>
      contributions.find((c) => String(c.id) === contributionId) ?? null,
    [contributions, contributionId],
  );

  const remaining = selectedContribution
    ? Number(selectedContribution.remaining)
    : 0;

  const expenseAmount = Number(amount);
  const allocTotal = useMemo(
    () =>
      selectedMemberIds.reduce((sum, id) => {
        const n = Number(amountByMember[id] ?? "");
        return Number.isFinite(n) ? sum + n : sum;
      }, 0),
    [selectedMemberIds, amountByMember],
  );
  const amountMismatch =
    kind === "member" &&
    selectedMemberIds.length > 0 &&
    Number.isFinite(expenseAmount) &&
    expenseAmount > 0 &&
    Math.abs(allocTotal - expenseAmount) > 0.009;

  const fullContributionPayout =
    kind === "member" &&
    funding === "contribution" &&
    selectedContribution != null &&
    Number.isFinite(expenseAmount) &&
    expenseAmount > 0 &&
    Math.abs(expenseAmount - remaining) <= 0.009;

  const notesRequired =
    kind === "miscellaneous" ||
    (kind === "member" && funding === "bank") ||
    (kind === "member" &&
      funding === "contribution" &&
      !fullContributionPayout);

  const contributionLeftAfterPayout =
    selectedContribution && Number.isFinite(expenseAmount)
      ? Math.max(0, remaining - (expenseAmount > 0 ? expenseAmount : 0))
      : null;

  function redistribute(
    memberIds: number[],
    totalRaw: string,
  ): Record<number, string> {
    const total = Number(totalRaw);
    const parts = splitAmount(
      Number.isFinite(total) && total > 0 ? total : 0,
      memberIds.length,
    );
    const next: Record<number, string> = {};
    memberIds.forEach((id, index) => {
      next[id] = parts[index] ?? "";
    });
    return next;
  }

  function applyContribution(id: string) {
    setContributionId(id);
    const option = contributions.find((c) => String(c.id) === id);
    if (!option) return;
    const nextAmount = option.remaining;
    setAmount(nextAmount);
    setAmountByMember((prev) => {
      if (selectedMemberIds.length === 0) return prev;
      return redistribute(selectedMemberIds, nextAmount);
    });
  }

  function setExpenseAmount(value: string) {
    setAmount(value);
    if (selectedMemberIds.length > 0) {
      setAmountByMember(redistribute(selectedMemberIds, value));
    }
  }

  function toggleMember(memberId: number, checked: boolean) {
    const nextIds = checked
      ? [...selectedMemberIds, memberId]
      : selectedMemberIds.filter((id) => id !== memberId);
    setSelectedMemberIds(nextIds);
    setAmountByMember((prev) => {
      if (!checked) {
        if (nextIds.length === 0) {
          const rest = { ...prev };
          delete rest[memberId];
          return rest;
        }
        return redistribute(nextIds, amount);
      }
      return redistribute(nextIds, amount);
    });
  }

  function switchKind(next: "miscellaneous" | "member") {
    setKind(next);
    if (next === "miscellaneous") {
      setFunding("bank");
      setContributionId("");
      setSelectedMemberIds([]);
      setAmountByMember({});
    }
  }

  function switchFunding(next: FundingSource) {
    setFunding(next);
    if (next === "bank") {
      setContributionId("");
    } else if (contributionId) {
      applyContribution(contributionId);
    }
  }

  return (
    <form action={recordExpense} className="form-grid">
      <FormBusyMarker />
      <label className="field">
        Date
        <input
          name="expense_date"
          type="date"
          required
          defaultValue={today}
        />
      </label>

      <fieldset className="field expense-kind-fieldset">
        <legend>Paid to</legend>
        <div className="expense-kind-row">
          <label className="expense-kind-option">
            <input
              type="radio"
              name="kind"
              value="miscellaneous"
              checked={kind === "miscellaneous"}
              onChange={() => switchKind("miscellaneous")}
            />
            Miscellaneous
          </label>
          <label className="expense-kind-option">
            <input
              type="radio"
              name="kind"
              value="member"
              checked={kind === "member"}
              onChange={() => switchKind("member")}
            />
            Member(s)
          </label>
        </div>
      </fieldset>

      {kind === "member" ? (
        <>
          <fieldset className="field expense-kind-fieldset">
            <legend>Funded from</legend>
            <div className="expense-kind-row">
              <label className="expense-kind-option">
                <input
                  type="radio"
                  name="funding_source"
                  value="contribution"
                  checked={funding === "contribution"}
                  onChange={() => switchFunding("contribution")}
                />
                A contribution
              </label>
              <label className="expense-kind-option">
                <input
                  type="radio"
                  name="funding_source"
                  value="bank"
                  checked={funding === "bank"}
                  onChange={() => switchFunding("bank")}
                />
                Bank balance
              </label>
            </div>
          </fieldset>

          {funding === "contribution" ? (
            <label className="field">
              Contribution
              <select
                name="payment_request_id"
                required
                value={contributionId}
                onChange={(e) => applyContribution(e.target.value)}
              >
                <option value="">Select contribution</option>
                {contributions.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                    disabled={Number(c.remaining) <= 0}
                  >
                    {c.title}
                    {c.concluded ? " (concluded)" : " (open)"} · realised{" "}
                    {formatMoney(c.realised_total)} · left{" "}
                    {formatMoney(c.remaining)}
                  </option>
                ))}
              </select>
              {selectedContribution ? (
                <span className="field-hint">
                  Realised {formatMoney(selectedContribution.realised_total)}.
                  Amount fills with remaining{" "}
                  {formatMoney(selectedContribution.remaining)}; select one or
                  more members below to receive it
                  {contributionLeftAfterPayout != null
                    ? ` (left after this: ${formatMoney(contributionLeftAfterPayout)})`
                    : ""}
                  .
                </span>
              ) : (
                <span className="field-hint">
                  Prefer a concluded contribution. Then select the member(s)
                  who receive the payout.
                </span>
              )}
            </label>
          ) : (
            <p className="field-hint" style={{ margin: 0 }}>
              Drawn from the group bank balance ({formatMoney(bankBalance)}).
              Select one or more members below. Notes are required.
            </p>
          )}
        </>
      ) : null}

      <label className="field">
        Amount (₦)
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setExpenseAmount(e.target.value)}
          max={
            kind === "member" &&
            funding === "contribution" &&
            selectedContribution
              ? selectedContribution.remaining
              : undefined
          }
        />
      </label>

      {kind === "member" ? (
        <fieldset className="field expense-kind-fieldset expense-member-picker">
          <legend>Members receiving this payout</legend>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Select one or more members. Amounts start equal-split and can be
            edited; they must still total the expense amount
            {funding === "contribution"
              ? ", which is subtracted from the contribution pot"
              : ""}
            .
          </p>
          <div className="expense-member-list">
            {members.map((m) => {
              const checked = selectedMemberIds.includes(m.id);
              return (
                <div key={m.id} className="expense-member-row">
                  <label className="expense-kind-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleMember(m.id, e.target.checked)}
                    />
                    {m.name}
                  </label>
                  {checked ? (
                    <>
                      <input type="hidden" name="alloc_member_id" value={m.id} />
                      <label className="field expense-member-amount">
                        Amount received (₦)
                        <input
                          name="alloc_amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={amountByMember[m.id] ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAmountByMember((prev) => ({
                              ...prev,
                              [m.id]: value,
                            }));
                          }}
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="expense-alloc-meta">
            <span className="muted">
              {selectedMemberIds.length} member
              {selectedMemberIds.length === 1 ? "" : "s"} selected
            </span>
            <span className={amountMismatch ? "form-error" : "muted"}>
              Recipients total {formatMoney(allocTotal)}
              {amountMismatch ? " (must match expense amount)" : ""}
            </span>
          </div>
          {selectedMemberIds.length === 0 ? (
            <p className="form-error" role="alert" style={{ margin: 0 }}>
              Select at least one member.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <label className="field">
        Notes / breakdown
        {!notesRequired ? " (optional for full contribution payout)" : ""}
        <textarea
          name="notes"
          required={notesRequired}
          minLength={notesRequired ? 3 : undefined}
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            notesRequired
              ? funding === "bank" && kind === "member"
                ? "Why this payout comes from the bank balance, refs, etc."
                : "What was paid for, why only part of the contribution, refs, etc."
              : "Optional — full remaining realised amount is being paid out."
          }
        />
        {!notesRequired ? (
          <span className="field-hint">
            Notes are optional because this pays out the contribution’s remaining
            realised total in full.
          </span>
        ) : null}
      </label>

      <div className="form-actions">
        <PendingSubmitButton
          className="btn-primary"
          idleLabel="Record expense"
          pendingLabel="Saving…"
          disabled={kind === "member" && selectedMemberIds.length === 0}
        />
        <FormPendingStatus message="Saving expense…" />
      </div>
    </form>
  );
}
