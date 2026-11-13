"use client";

import { useId, useState, type ReactNode } from "react";

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

  return (
    <div className={`archive-item${open ? " is-open" : ""}`}>
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
        <div id={panelId} className="archive-item-body stack">
          {children}
        </div>
      ) : null}
    </div>
  );
}
