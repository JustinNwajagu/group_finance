"use client";

import Link from "next/link";
import { useState } from "react";
import {
  formatDate,
  formatExpenseFunding,
  formatExpenseKind,
  formatMoney,
} from "@/lib/format";
import type { ExpenseView } from "@/lib/types";

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
    <div className="archive-boards">
      {expenses.map((expense) => {
        const open = openId === expense.id;
        const panelId = `certified-expense-${expense.id}`;
        const paidTo =
          expense.allocations.length === 0
            ? "—"
            : expense.allocations.length === 1
              ? `${expense.allocations[0]!.member_name} · ${formatMoney(expense.allocations[0]!.amount)}`
              : `${expense.allocations.length} members`;
        const title =
          expense.notes?.trim() ||
          expense.contribution_title ||
          formatExpenseKind(expense.kind);

        return (
          <div
            key={expense.id}
            className={`archive-item${open ? " is-open" : ""}`}
          >
            <button
              type="button"
              className="archive-item-toggle"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() =>
                setOpenId((current) =>
                  current === expense.id ? null : expense.id,
                )
              }
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
              <div id={panelId} className="archive-item-body stack">
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
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
