"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type PrimaryNavItem = {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
};

export function PrimaryNav({ items }: { items: PrimaryNavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const activeLabel = items.find((item) => item.active)?.label ?? "Menu";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className={`primary-nav${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="nav-menu-toggle"
        aria-expanded={open}
        aria-controls="primary-nav-links"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="nav-menu-label">{activeLabel}</span>
        <span className="nav-menu-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      <nav id="primary-nav-links" className="nav" aria-label="Primary">
        {items.map((item) => {
          const badgeCount =
            typeof item.badge === "number" ? item.badge : undefined;
          const hasBadge = typeof badgeCount === "number" && badgeCount > 0;
          const className = [
            "nav-link",
            item.active ? "active" : "",
            typeof badgeCount === "number" ? "nav-link-with-badge" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={className}
              aria-label={
                hasBadge
                  ? `${item.label}, ${badgeCount} pending request${
                      badgeCount === 1 ? "" : "s"
                    }`
                  : undefined
              }
            >
              {item.label}
              {hasBadge ? (
                <span className="nav-count" aria-hidden="true">
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
