"use client";

import { useMemo, useState } from "react";
import { recordExpense } from "@/app/actions/expenses";
import { FormBusyMarker } from "@/components/action-form";
import {
  FormPendingStatus,
  PendingSubmitButton,
} from "@/components/pending-submit-button";
import { formatMoney } from "@/lib/format";
import type { Member } from "@/lib/types";

type AllocLine = {
  key: string;
  member_id: string;
  amount: string;
};

let allocKey = 0;
function nextKey() {
  allocKey += 1;
  return `alloc-${allocKey}`;
}

export function RecordExpenseForm({
  members,
  today,
}: {
  members: Member[];
  today: string;
}) {
  const [kind, setKind] = useState<"miscellaneous" | "member">("miscellaneous");
  const [amount, setAmount] = useState("");
  const [lines, setLines] = useState<AllocLine[]>([
    { key: nextKey(), member_id: "", amount: "" },
  ]);

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
      <label className="field">
        Amount (₦)
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
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
              onChange={() => setKind("miscellaneous")}
            />
            Miscellaneous
          </label>
          <label className="expense-kind-option">
            <input
              type="radio"
              name="kind"
              value="member"
              checked={kind === "member"}
              onChange={() => setKind("member")}
            />
            Member(s)
          </label>
        </div>
      </fieldset>

      {kind === "member" ? (
        <div className="expense-alloc-block">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Split the payout across one or more members. Totals must match the
            expense amount.
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
        <textarea
          name="notes"
          required
          minLength={3}
          rows={4}
          placeholder="What was paid for, invoice refs, cash collector, etc."
        />
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
