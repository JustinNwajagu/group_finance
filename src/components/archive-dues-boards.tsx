"use client";

import { useRef, useState } from "react";
import { DuesYearTable } from "@/components/dues-year-table";
import { useScrollOpenIntoView } from "@/hooks/use-scroll-open-into-view";
import { formatDate, formatMoney } from "@/lib/format";
import { normalizeDuesYearTitle } from "@/lib/dues-title";
import type { DuesYearBoard } from "@/lib/types";

function ArchiveDuesItem({
  board,
  isAdmin,
  open,
  onToggle,
}: {
  board: DuesYearBoard;
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { schedule, total_collected } = board;
  const panelId = `archive-dues-${schedule.id}`;
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollOpenIntoView(open, rootRef);
  const title = normalizeDuesYearTitle(
    schedule.title || `${schedule.year} dues`,
    schedule.year,
  );

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
        <div id={panelId} className="archive-item-body">
          <div className="archive-scroll-pane">
            <div className="archive-scroll-pane-inner">
              <DuesYearTable board={board} />
            </div>
          </div>
          {isAdmin ? (
            <p className="muted archive-item-note">
              This dues year stays in Archive. Use Admin tools to amend
              payments — it cannot be opened again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

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
      {boards.map((board) => (
        <ArchiveDuesItem
          key={board.schedule.id}
          board={board}
          isAdmin={isAdmin}
          open={openId === board.schedule.id}
          onToggle={() =>
            setOpenId((current) =>
              current === board.schedule.id ? null : board.schedule.id,
            )
          }
        />
      ))}
    </div>
  );
}
