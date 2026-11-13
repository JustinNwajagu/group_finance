"use client";

import { useState, type ReactNode } from "react";

export function DashTools({
  title = "Admin tools",
  asideClassName = "dash-aside",
  children,
}: {
  title?: string;
  asideClassName?: "dash-aside" | "expenses-aside";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <aside
      className={`${asideClassName} dash-tools${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="dash-tools-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="dash-tools-toggle-label">{title}</span>
        <span className="dash-tools-toggle-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      <div className="dash-tools-body stack">{children}</div>
    </aside>
  );
}
