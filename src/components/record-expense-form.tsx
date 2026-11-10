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

type AllocLine = {
  key: string;
  member_id: string;
  amount: string;
};

type FundingSource = "contribution" | "bank";

let allocKey = 0;
function nextKey() {
  allocKey += 1;
  return `alloc-${allocKey}`;
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
  const [lines, setLines] = useState<AllocLine[]>([
    { key: nextKey(), member_id: "", amount: "" },
  ]);

  const selectedContribution = useMemo(
    () =>
      contributions.find((c) => String(c.id) === contributionId) ?? null,
    [contributions, contributionId],
  );

  const remaining = selectedContribution
    ? Number(selectedContribution.remaining)
    : 0;

  const allocTotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const n = Number(line.amount);
        return Number.isFinite(n) ? sum + n : sum;
      }, 0),
    [lines],
  );
  const expenseAmount = Number(amount);
  const amountMismatch =
    kind === "member" &&
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

  function applyContribution(id: string) {
    setContributionId(id);
    const option = contributions.find((c) => String(c.id) === id);
    if (!option) return;
    const nextAmount = option.remaining;
    setAmount(nextAmount);
    setLines((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0]!, amount: nextAmount }];
      }
      return prev;
    });
  }

  function switchKind(next: "miscellaneous" | "member") {
    setKind(next);
    if (next === "miscellaneous") {
      setFunding("bank");
      setContributionId("");
    } else if (!funding) {
      setFunding("contribution");
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
                  Paying out fills the amount with the remaining{" "}
                  {formatMoney(selectedContribution.remaining)} and subtracts
                  member payouts from that pot
                  {contributionLeftAfterPayout != null
                    ? ` (left after this: ${formatMoney(contributionLeftAfterPayout)})`
                    : ""}
                  .
                </span>
              ) : (
                <span className="field-hint">
                  Prefer a concluded contribution. Selecting one fills the
                  amount with its remaining realised total.
                </span>
              )}
            </label>
          ) : (
            <p className="field-hint" style={{ margin: 0 }}>
              Drawn from the group bank balance ({formatMoney(bankBalance)}).
              Notes are required.
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
          onChange={(e) => {
            const value = e.target.value;
            setAmount(value);
            setLines((prev) => {
              if (prev.length === 1) {
                return [{ ...prev[0]!, amount: value }];
              }
              return prev;
            });
          }}
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
        <div className="expense-alloc-block">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Document each member and the amount they receive. Totals must match
            the expense amount
            {selectedContribution
              ? "; that amount is subtracted from the contribution pot"
              : ""}
            .
          </p>
          {lines.map((line, index) => (
            <div className="expense-alloc-row" key={line.key}>
              <label className="field">
                Member
                <select
                  name="alloc_member_id"
                  required
                  value={line.member_id}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLines((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, member_id: value } : row,
                      ),
                    );
                  }}
                >
                  <option value="">Select member</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Amount received (₦)
                <input
                  name="alloc_amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={line.amount}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLines((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, amount: value } : row,
                      ),
                    );
                  }}
                />
              </label>
              {lines.length > 1 ? (
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    setLines((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <div className="expense-alloc-meta">
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  { key: nextKey(), member_id: "", amount: "" },
                ])
              }
            >
              + Add member
            </button>
            <span className={amountMismatch ? "form-error" : "muted"}>
              Recipients total {formatMoney(allocTotal)}
              {amountMismatch ? " (must match expense amount)" : ""}
            </span>
          </div>
        </div>
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
        />
        <FormPendingStatus message="Saving expense…" />
      </div>
    </form>
  );
}
