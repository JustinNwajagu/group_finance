"use client";

import { useMemo, useState } from "react";
import { recordExpense } from "@/app/actions/expenses";
import { FormBusyMarker } from "@/components/action-form";
import {
  FormPendingStatus,
  PendingSubmitButton,
} from "@/components/pending-submit-button";
import { formatMoney } from "@/lib/format";
import type {
  ContributionFundingOption,
  ExpenseFundingSource,
  ExpenseKind,
  Member,
} from "@/lib/types";

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
}: {
  members: Member[];
  contributions: ContributionFundingOption[];
  today: string;
  /** @deprecated kept optional for call-site compatibility */
  bankBalance?: string;
}) {
  const [kind, setKind] = useState<ExpenseKind>("miscellaneous");
  const [funding, setFunding] = useState<ExpenseFundingSource>("contribution");
  const [contributionId, setContributionId] = useState("");
  const [contributionAmount, setContributionAmount] = useState("");
  const [bankAmount, setBankAmount] = useState("");
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

  const contributionNum = Number(contributionAmount);
  const bankNum = Number(bankAmount);
  const expenseAmount = useMemo(() => {
    if (funding === "contribution") {
      return Number.isFinite(contributionNum) && contributionNum > 0
        ? contributionNum
        : 0;
    }
    if (funding === "bank") {
      return Number.isFinite(bankNum) && bankNum > 0 ? bankNum : 0;
    }
    return (
      (Number.isFinite(contributionNum) && contributionNum > 0
        ? contributionNum
        : 0) + (Number.isFinite(bankNum) && bankNum > 0 ? bankNum : 0)
    );
  }, [funding, contributionNum, bankNum]);

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
    expenseAmount > 0 &&
    Math.abs(allocTotal - expenseAmount) > 0.009;

  const usesContribution =
    funding === "contribution" || funding === "both";
  const usesBank = funding === "bank" || funding === "both";
  const fullContributionPayout =
    funding === "contribution" &&
    selectedContribution != null &&
    Number.isFinite(contributionNum) &&
    contributionNum > 0 &&
    Math.abs(contributionNum - remaining) <= 0.009;
  const notesRequired = usesBank || (usesContribution && !fullContributionPayout);

  const contributionLeftAfter =
    selectedContribution && Number.isFinite(contributionNum)
      ? Math.max(0, remaining - (contributionNum > 0 ? contributionNum : 0))
      : null;

  function redistribute(
    memberIds: number[],
    total: number,
  ): Record<number, string> {
    const parts = splitAmount(total > 0 ? total : 0, memberIds.length);
    const next: Record<number, string> = {};
    memberIds.forEach((id, index) => {
      next[id] = parts[index] ?? "";
    });
    return next;
  }

  function syncMemberAmounts(total: number, memberIds = selectedMemberIds) {
    if (memberIds.length === 0) return;
    setAmountByMember(redistribute(memberIds, total));
  }

  function applyContribution(
    id: string,
    fundingMode: ExpenseFundingSource = funding,
  ) {
    setContributionId(id);
    const option = contributions.find((c) => String(c.id) === id);
    if (!option) return;
    if (fundingMode === "contribution") {
      setContributionAmount(option.remaining);
      setBankAmount("");
      syncMemberAmounts(Number(option.remaining));
      return;
    }
    if (fundingMode === "both") {
      const current = Number(contributionAmount);
      const next =
        !Number.isFinite(current) ||
        current <= 0 ||
        current - Number(option.remaining) > 0.009
          ? option.remaining
          : contributionAmount;
      setContributionAmount(next);
      const total =
        Number(next || 0) +
        (Number.isFinite(Number(bankAmount)) ? Number(bankAmount) : 0);
      syncMemberAmounts(total);
    }
  }

  function switchFunding(next: ExpenseFundingSource) {
    setFunding(next);
    if (next === "bank") {
      setContributionId("");
      setContributionAmount("");
      const nextBank =
        bankAmount ||
        (expenseAmount > 0 ? expenseAmount.toFixed(2) : bankAmount);
      setBankAmount(nextBank);
      syncMemberAmounts(Number(nextBank) || 0);
      return;
    }
    if (next === "contribution") {
      setBankAmount("");
      if (contributionId) {
        applyContribution(contributionId, "contribution");
      } else if (selectedContribution) {
        setContributionAmount(selectedContribution.remaining);
        syncMemberAmounts(Number(selectedContribution.remaining));
      }
      return;
    }
    if (contributionId) applyContribution(contributionId, "both");
  }

  function switchKind(next: ExpenseKind) {
    setKind(next);
    if (next !== "member") {
      setSelectedMemberIds([]);
      setAmountByMember({});
    }
  }

  function toggleMember(memberId: number, checked: boolean) {
    const nextIds = checked
      ? [...selectedMemberIds, memberId]
      : selectedMemberIds.filter((id) => id !== memberId);
    setSelectedMemberIds(nextIds);
    if (!checked && nextIds.length === 0) {
      setAmountByMember((prev) => {
        const rest = { ...prev };
        delete rest[memberId];
        return rest;
      });
      return;
    }
    syncMemberAmounts(expenseAmount, nextIds);
  }

  function onContributionAmountChange(value: string) {
    setContributionAmount(value);
    const c = Number(value);
    const b = funding === "both" && Number.isFinite(bankNum) ? bankNum : 0;
    syncMemberAmounts((Number.isFinite(c) ? c : 0) + b);
  }

  function onBankAmountChange(value: string) {
    setBankAmount(value);
    const b = Number(value);
    const c =
      usesContribution && Number.isFinite(contributionNum)
        ? contributionNum
        : 0;
    syncMemberAmounts(c + (Number.isFinite(b) ? b : 0));
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
        <legend>Expense type</legend>
        <div className="expense-kind-row">
          {(
            [
              ["member", "Member(s)"],
              ["meeting", "Meeting"],
              ["miscellaneous", "Miscellaneous"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="expense-kind-option">
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => switchKind(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field expense-kind-fieldset">
        <legend>Funded from</legend>
        <div className="expense-kind-row">
          {(
            [
              ["contribution", "Contribution"],
              ["bank", "Bank"],
              ["both", "Both"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="expense-kind-option">
              <input
                type="radio"
                name="funding_source"
                value={value}
                checked={funding === value}
                onChange={() => switchFunding(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {usesContribution ? (
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
              <option key={c.id} value={c.id}>
                {c.title}
                {c.concluded ? " (concluded)" : " (open)"} · left{" "}
                {formatMoney(c.remaining)}
              </option>
            ))}
          </select>
          {selectedContribution ? (
            <span className="field-hint">
              Remaining realised {formatMoney(selectedContribution.remaining)}
              {contributionLeftAfter != null
                ? ` · left after this draw: ${formatMoney(contributionLeftAfter)}`
                : ""}
              .
            </span>
          ) : null}
        </label>
      ) : null}

      {usesContribution ? (
        <label className="field">
          From contribution (₦)
          <input
            name="contribution_amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={contributionAmount}
            onChange={(e) => onContributionAmountChange(e.target.value)}
            max={selectedContribution ? selectedContribution.remaining : undefined}
          />
        </label>
      ) : null}

      {usesBank ? (
        <label className="field">
          {funding === "both" ? "Bank top-up (₦)" : "From bank (₦)"}
          <input
            name="bank_amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={bankAmount}
            onChange={(e) => onBankAmountChange(e.target.value)}
          />
          {funding === "both" ? (
            <span className="field-hint">
              Extra bank money used to augment the contribution draw.
            </span>
          ) : null}
        </label>
      ) : null}

      <p className="field-hint" style={{ margin: 0 }}>
        Expense total{" "}
        <strong>{formatMoney(expenseAmount)}</strong>
        {funding === "both"
          ? ` (${formatMoney(contributionNum || 0)} contribution + ${formatMoney(bankNum || 0)} bank)`
          : ""}
      </p>

      {kind === "member" ? (
        <fieldset className="field expense-kind-fieldset expense-member-picker">
          <legend>Members receiving this payout</legend>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Select one or more members. Amounts start equal-split across the
            expense total and can be edited.
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
              {amountMismatch ? " (must match expense total)" : ""}
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
              ? usesBank && usesContribution
                ? "Explain the bank top-up and why the contribution is not paid out in full."
                : usesBank
                  ? "Explain this bank-funded expense."
                  : "Explain why the contribution is not paid out in full."
              : "Optional — full remaining realised contribution amount is being used."
          }
        />
        {notesRequired ? (
          <span className="field-hint">
            Notes are required for any bank funding and for contribution draws
            that are not the full remaining realised amount.
          </span>
        ) : (
          <span className="field-hint">
            Notes are optional because this uses the contribution’s remaining
            realised total in full, with no bank money.
          </span>
        )}
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
