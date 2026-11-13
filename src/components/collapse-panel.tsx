"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useScrollOpenIntoView } from "@/hooks/use-scroll-open-into-view";

export function CollapsePanel({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reactId = useId();
  const panelId = `collapse-${reactId.replace(/:/g, "")}`;
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
        onClick={() => setOpen((v) => !v)}
      >
        <span className="archive-item-main">
          <span className="archive-item-title">{title}</span>
          {meta ? (
            <span className="archive-item-meta muted">{meta}</span>
          ) : null}
        </span>
        <span className="archive-item-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="archive-item-body">
          <div className="archive-scroll-pane">
            <div className="archive-scroll-pane-inner stack">{children}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
