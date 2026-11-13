"use client";

import { useEffect, useRef, useState } from "react";
import { DuesYearTable } from "@/components/dues-year-table";
import { formatDate, formatMoney } from "@/lib/format";
import { normalizeDuesYearTitle } from "@/lib/dues-title";
import type { DuesYearBoard } from "@/lib/types";

export function ArchiveDuesBoards({
  boards,
  isAdmin,
}: {
  boards: DuesYearBoard[];
  isAdmin: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (openId == null) return;
    const node = itemRefs.current.get(openId);
    if (!node) return;
    // Bring the open dropdown container onto the screen without overshooting
    // into empty space below the archive list.
    node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [openId]);

  if (boards.length === 0) {
    return <div className="hero-empty">No archived dues years yet.</div>;
  }

  return (
    <div className="archive-boards">
      {boards.map((board) => {
        const { schedule, total_collected } = board;
        const open = openId === schedule.id;
        const panelId = `archive-dues-${schedule.id}`;
        const title = normalizeDuesYearTitle(
          schedule.title || `${schedule.year} dues`,
          schedule.year,
        );
        return (
          <div
            key={schedule.id}
            className={`archive-item${open ? " is-open" : ""}`}
            ref={(el) => {
              if (el) itemRefs.current.set(schedule.id, el);
              else itemRefs.current.delete(schedule.id);
            }}
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
      })}
    </div>
  );
}
