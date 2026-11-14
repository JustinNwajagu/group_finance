"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useScrollOpenIntoView } from "@/hooks/use-scroll-open-into-view";
import {
  formatDate,
  formatExpenseFunding,
  formatExpenseKind,
  formatMoney,
} from "@/lib/format";
import type { ExpenseView } from "@/lib/types";

function CertifiedExpenseItem({
  expense,
  open,
  onToggle,
}: {
  expense: ExpenseView;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `certified-expense-${expense.id}`;
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollOpenIntoView(open, rootRef);

  const paidTo =
    expense.allocations.length === 0
      ? "—"
      : expense.allocations.length === 1
        ? `${expense.allocations[0]!.member_name} · ${formatMoney(expense.allocations[0]!.amount)}`
        : `${expense.allocations.length} members`;
  const title =
    expense.title?.trim() ||
    expense.contribution_title?.trim() ||
    (expense.allocations.length === 1
      ? `Payout to ${expense.allocations[0]!.member_name}`
      : expense.allocations.length > 1
        ? `Payout to ${expense.allocations.length} members`
        : formatExpenseKind(expense.kind));

  return (
    <div
      ref={rootRef}
      className={`archive-item${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="archive-item-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="archive-item-main">
          <span className="archive-item-title">{title}</span>
          <span className="archive-item-meta muted">
            {formatDate(expense.expense_date)}
            {" · "}
            {formatMoney(expense.amount)}
            {" · "}
            {formatExpenseKind(expense.kind)}
            {" · "}
            {paidTo}
          </span>
        </span>
        <span className="archive-item-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="archive-item-body">
          <div className="archive-scroll-pane">
            <div className="archive-scroll-pane-inner stack">
              <p className="expense-funding" style={{ margin: 0 }}>
                <span className="expense-meta-label">Funded from</span>{" "}
                {formatExpenseFunding({
                  funding_source: expense.funding_source,
                  contribution_title: expense.contribution_title,
                  contribution_amount: expense.contribution_amount,
                  bank_amount: expense.bank_amount,
                })}
              </p>
              {expense.notes ? (
                <p className="expense-notes" style={{ margin: 0 }}>
                  <span className="expense-meta-label">Notes</span>{" "}
                  {expense.notes}
                </p>
              ) : null}
              {expense.allocations.length > 0 ? (
                <ul className="expense-alloc-list">
                  {expense.allocations.map((a) => (
                    <li key={`${expense.id}-${a.member_id}`}>
                      <Link
                        className="row-link"
                        href={`/members/${a.member_id}`}
                      >
                        {a.member_name}
                      </Link>{" "}
                      · {formatMoney(a.amount)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="muted" style={{ margin: 0 }}>
                Certified by{" "}
                {expense.certifications
                  .map((c) => c.name || c.email)
                  .join(", ")}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CertifiedExpensesList({
  expenses,
}: {
  expenses: ExpenseView[];
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (expenses.length === 0) {
    return <div className="hero-empty">No certified expenses yet.</div>;
  }

  return (
    <div className="archive-boards-scroll">
      <div className="archive-boards">
        {expenses.map((expense) => (
          <CertifiedExpenseItem
            key={expense.id}
            expense={expense}
            open={openId === expense.id}
            onToggle={() =>
              setOpenId((current) =>
                current === expense.id ? null : expense.id,
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
