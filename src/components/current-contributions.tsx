"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ContributionBoard } from "@/components/contribution-board";
import { formatDate, formatMoney } from "@/lib/format";
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
  const [openId, setOpenId] = useState<number | null>(
    () => sorted[0]?.request.id ?? null,
  );
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (openId == null) return;
    const node = itemRefs.current.get(openId);
    if (!node) return;
    node.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [openId]);

  if (sorted.length === 0) {
    return <div className="hero-empty">No open contribution requests.</div>;
  }

  return (
    <div className="archive-boards">
      {sorted.map((board) => {
        const { request, pledge_total, realised_total } = board;
        const open = openId === request.id;
        const panelId = `current-board-${request.id}`;
        return (
          <div
            key={request.id}
            className={`archive-item${open ? " is-open" : ""}`}
            ref={(el) => {
              if (el) itemRefs.current.set(request.id, el);
              else itemRefs.current.delete(request.id);
            }}
          >
            <button
              type="button"
              className="archive-item-toggle"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() =>
                setOpenId((current) =>
                  current === request.id ? null : request.id,
                )
              }
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
                <div className="archive-scroll-pane">
                  <div className="archive-scroll-pane-inner">
                    <ContributionBoard
                      board={board}
                      isAdmin={isAdmin}
                      returnTo="/payments"
                      hideHeader
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
