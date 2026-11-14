"use client";

import { useState } from "react";
import { createPaymentRequest } from "@/app/actions/payments";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { ExpenseKind, Member } from "@/lib/types";

export function OpenContributionForm({
  members,
  today,
}: {
  members: Member[];
  today: string;
}) {
  const [kind, setKind] = useState<ExpenseKind>("miscellaneous");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

  function switchKind(next: ExpenseKind) {
    setKind(next);
    if (next !== "member") setSelectedMemberIds([]);
  }

  function toggleMember(memberId: number, checked: boolean) {
    setSelectedMemberIds((prev) =>
      checked ? [...prev, memberId] : prev.filter((id) => id !== memberId),
    );
  }

  return (
    <form action={createPaymentRequest} className="form-grid">
      <label className="field">
        Title
        <input name="title" required autoComplete="off" />
      </label>
      <label className="field">
        Minimum amount per member (₦)
        <input
          name="amount"
          type="number"
          min="0"
          step="0.01"
          required
          placeholder="0.00"
        />
      </label>
      <label className="field">
        Payment deadline
        <input name="deadline" type="date" required defaultValue={today} />
      </label>

      <fieldset className="field expense-kind-fieldset">
        <legend>Contribution is for</legend>
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

      {kind === "member" ? (
        <fieldset className="field expense-kind-fieldset expense-member-picker">
          <legend>Members this contribution supports</legend>
          <p className="field-hint" style={{ marginTop: 0 }}>
            Selected members are exempt from this contribution (not listed as
            outstanding, and it does not count toward their contribution total).
          </p>
          <div className="expense-member-list">
            {members.map((m) => {
              const checked = selectedMemberIds.includes(m.id);
              return (
                <div key={m.id} className="expense-member-row">
                  <label className="expense-kind-option">
                    <input
                      type="checkbox"
                      name="beneficiary_member_id"
                      value={m.id}
                      checked={checked}
                      onChange={(e) => toggleMember(m.id, e.target.checked)}
                    />
                    {m.name}
                  </label>
                </div>
              );
            })}
          </div>
          {selectedMemberIds.length === 0 ? (
            <p className="form-error" role="alert" style={{ margin: 0 }}>
              Select at least one member.
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {selectedMemberIds.length} member
              {selectedMemberIds.length === 1 ? "" : "s"} selected
            </p>
          )}
        </fieldset>
      ) : null}

      <PendingSubmitButton
        idleLabel="Create payment"
        pendingLabel="Creating…"
        disabled={kind === "member" && selectedMemberIds.length === 0}
      />
    </form>
  );
}
