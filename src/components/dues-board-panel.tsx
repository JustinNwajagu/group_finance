"use client";

import { useMemo, useState } from "react";
import { DuesYearTable } from "@/components/dues-year-table";
import { formatDate, formatMoney } from "@/lib/format";
import type { DuesYearBoard } from "@/lib/types";

export function DuesBoardPanel({
  board,
}: {
  board: DuesYearBoard | null;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!board) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return board;
    return {
      ...board,
      rows: board.rows.filter(
        (row) =>
          row.member.name.toLowerCase().includes(needle) ||
          (row.member.email ?? "").toLowerCase().includes(needle),
      ),
    };
  }, [board, q]);

  return (
    <section className="panel">
      <div className="panel-heading-row">
        <h2>
          {board
            ? board.schedule.title || `${board.schedule.year} dues`
            : "Year tracker"}
        </h2>
        {board ? (
          <p className="panel-heading-meta">
            Monthly {formatMoney(board.schedule.monthly_amount)} · Deadline{" "}
            {formatDate(board.schedule.deadline)} · Collected{" "}
            <strong>{formatMoney(board.total_collected)}</strong>
          </p>
        ) : null}
      </div>

      {board ? (
        <label className="filter">
          <span className="sr-only">Filter members</span>
          <input
            type="search"
            value={q}
            placeholder="Filter members…"
            className="filter-input"
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      ) : null}

      {!filtered ? (
        <div className="hero-empty">
          Open a dues year to start tracking Sept–Aug payments.
        </div>
      ) : (
        <DuesYearTable
          board={filtered}
          emptyLabel={
            q.trim()
              ? "No members match that filter."
              : "No members on the roster yet."
          }
        />
      )}
    </section>
  );
}
