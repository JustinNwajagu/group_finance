"use client";

import { useMemo, useState } from "react";
import { ContributionBoard } from "@/components/contribution-board";
import type { ContributionLists } from "@/lib/types";

export function CurrentContributions({
  boards,
  isAdmin,
}: {
  boards: ContributionLists[];
  isAdmin: boolean;
}) {
  const sorted = useMemo(
    () =>
      [...boards].sort((a, b) => {
        const byDeadline = a.request.deadline.localeCompare(b.request.deadline);
        if (byDeadline !== 0) return byDeadline;
        return b.request.id - a.request.id;
      }),
    [boards],
  );
  const [selectedId, setSelectedId] = useState(
    () => String(sorted[0]?.request.id ?? ""),
  );

  if (sorted.length === 0) {
    return <div className="hero-empty">No open contribution requests.</div>;
  }

  const selected =
    sorted.find((board) => String(board.request.id) === selectedId) ??
    sorted[0];

  return (
    <div className="contrib-boards">
      {sorted.length > 1 ? (
        <label className="field contrib-board-switch">
          Open contribution
          <select
            value={String(selected.request.id)}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="Select open contribution"
          >
            {sorted.map((board) => (
              <option key={board.request.id} value={board.request.id}>
                {board.request.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <ContributionBoard
        key={selected.request.id}
        board={selected}
        isAdmin={isAdmin}
        returnTo="/payments"
      />
    </div>
  );
}
