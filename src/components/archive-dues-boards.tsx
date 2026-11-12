"use client";

import { useState } from "react";
import { removeDuesPayment } from "@/app/actions/dues";
import { DuesYearTable } from "@/components/dues-year-table";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatCoveredMonths } from "@/lib/dues-months";
import { formatDate, formatMoney } from "@/lib/format";
import type { DuesYearBoard } from "@/lib/types";

export function ArchiveDuesBoards({
  boards,
  isAdmin,
}: {
  boards: DuesYearBoard[];
  isAdmin: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (boards.length === 0) {
    return <div className="hero-empty">No archived dues years yet.</div>;
  }

  return (
    <div className="archive-boards">
      {boards.map((board) => {
        const { schedule, total_collected } = board;
        const open = openId === schedule.id;
        const panelId = `archive-dues-${schedule.id}`;
        return (
          <div
            key={schedule.id}
            className={`archive-item${open ? " is-open" : ""}`}
          >
            <button
              type="button"
              className="archive-item-toggle"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() =>
                setOpenId((current) =>
                  current === schedule.id ? null : schedule.id,
                )
              }
            >
              <span className="archive-item-main">
                <span className="archive-item-title">
                  {schedule.title || `${schedule.year} dues`}
                </span>
                <span className="archive-item-meta muted">
                  Monthly {formatMoney(schedule.monthly_amount)}
                  {" · "}
                  Deadline {formatDate(schedule.deadline)}
                  {schedule.concluded_at
                    ? ` · Concluded ${formatDate(schedule.concluded_at.slice(0, 10))}`
                    : ""}
                  {" · "}
                  Collected {formatMoney(total_collected)}
                </span>
              </span>
              <span className="archive-item-chevron" aria-hidden="true">
                {open ? "▾" : "▸"}
              </span>
            </button>
            {open ? (
              <div id={panelId} className="archive-item-body stack">
                <DuesYearTable board={board} />
                {isAdmin ? (
                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                    This dues year stays in Archive. Amend payments below — it
                    cannot be opened again.
                  </p>
                ) : null}
                {isAdmin && board.payments.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Member</th>
                          <th>Amount</th>
                          <th>Months</th>
                          <th>Notes</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {board.payments.slice(0, 40).map((p) => (
                          <tr key={p.id}>
                            <td>{formatDate(p.payment_date)}</td>
                            <td>{p.member_name}</td>
                            <td>{formatMoney(p.amount)}</td>
                            <td className="muted">
                              {p.covered_months.length} (
                              {formatCoveredMonths(p.covered_months)})
                            </td>
                            <td className="muted">{p.notes || "—"}</td>
                            <td>
                              <form action={removeDuesPayment}>
                                <input type="hidden" name="id" value={p.id} />
                                <input
                                  type="hidden"
                                  name="return_to"
                                  value="/archive"
                                />
                                <PendingSubmitButton
                                  className="btn-ghost"
                                  style={{
                                    padding: "0.15rem 0.45rem",
                                    fontSize: "0.8rem",
                                  }}
                                  idleLabel="Remove"
                                  pendingLabel="Removing…"
                                />
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
