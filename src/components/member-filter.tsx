"use client";

import { useLayoutEffect, useRef } from "react";

function isMobileFilterViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 720px)").matches;
}

/** Name/email filter with a mobile clear control (desktop keeps the native search X). */
export function MemberFilter({
  value,
  onChange,
  placeholder = "Filter members…",
  label = "Filter members",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  /** Scroll position from just before search mode collapsed content above. */
  const resumeScrollRef = useRef<number | null>(null);
  const wasFilteringRef = useRef(false);
  const hasQuery = value.trim().length > 0;

  useLayoutEffect(() => {
    if (!isMobileFilterViewport()) {
      document.documentElement.classList.remove("is-member-filtering");
      resumeScrollRef.current = null;
      wasFilteringRef.current = false;
      return;
    }

    if (hasQuery) {
      const entered = !wasFilteringRef.current;
      wasFilteringRef.current = true;

      if (entered) {
        resumeScrollRef.current = window.scrollY;
      }

      document.documentElement.classList.add("is-member-filtering");

      // One settle on enter only — continuous re-pin fights the keyboard and
      // makes the page thrash up/down while typing.
      if (entered) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
      return;
    }

    if (wasFilteringRef.current) {
      wasFilteringRef.current = false;
      document.documentElement.classList.remove("is-member-filtering");
      const resumeY = resumeScrollRef.current;
      resumeScrollRef.current = null;
      if (resumeY !== null) {
        window.scrollTo({ top: resumeY, left: 0, behavior: "auto" });
      }
      return;
    }

    document.documentElement.classList.remove("is-member-filtering");
  }, [hasQuery]);

  useLayoutEffect(() => {
    return () => {
      document.documentElement.classList.remove("is-member-filtering");
    };
  }, []);

  return (
    <div
      ref={barRef}
      className={hasQuery ? "filter-bar is-filtering" : "filter-bar"}
    >
      <label className="filter">
        <span className="sr-only">{label}</span>
        <span className="filter-field">
          <input
            type="search"
            value={value}
            placeholder={placeholder}
            className="filter-input"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => onChange(e.target.value)}
          />
          {hasQuery ? (
            <button
              type="button"
              className="filter-clear"
              aria-label="Clear filter"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange("")}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </span>
      </label>
    </div>
  );
}
