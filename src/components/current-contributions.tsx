"use client";

import { useMemo, useRef, useState } from "react";
import { ContributionBoard } from "@/components/contribution-board";
import { useScrollOpenIntoView } from "@/hooks/use-scroll-open-into-view";
import { formatDate, formatMoney } from "@/lib/format";
import type { ContributionLists } from "@/lib/types";

function CurrentBoardItem({
  board,
  isAdmin,
  open,
  onToggle,
}: {
  board: ContributionLists;
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { request, pledge_total, realised_total } = board;
  const panelId = `current-board-${request.id}`;
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollOpenIntoView(open, rootRef);

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
          <span className="archive-item-title">{request.title}</span>
          <span className="archive-item-meta muted">
            Expected {formatMoney(request.amount)}
            {" · "}
            Deadline {formatDate(request.deadline)}
            {" · Open"}
            {" · "}
            Realised {formatMoney(realised_total)}
            {Number(pledge_total) > 0
              ? ` · Pledges ${formatMoney(pledge_total)}`
              : ""}
          </span>
        </span>
        <span className="archive-item-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="archive-item-body">
          <ContributionBoard
            board={board}
            isAdmin={isAdmin}
            returnTo="/payments"
            hideHeader
          />
        </div>
      ) : null}
    </div>
  );
}

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
  const [openId, setOpenId] = useState<number | null>(
    () => sorted[0]?.request.id ?? null,
  );

  if (sorted.length === 0) {
    return <div className="hero-empty">No open contribution requests.</div>;
  }

  return (
    <div className="archive-boards-scroll">
      <div className="archive-boards">
        {sorted.map((board) => (
          <CurrentBoardItem
            key={board.request.id}
            board={board}
            isAdmin={isAdmin}
            open={openId === board.request.id}
            onToggle={() =>
              setOpenId((current) =>
                current === board.request.id ? null : board.request.id,
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
