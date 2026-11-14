"use client";

import { useLayoutEffect, useRef } from "react";

function isMobileFilterViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 720px)").matches;
}

/** While collapsed, keep the filter at the top of the visual viewport. */
function pinFilterBar(el: HTMLElement | null) {
  if (!el || !isMobileFilterViewport()) return;
  if (window.scrollY > 0 || (window.visualViewport?.pageTop ?? 0) > 0) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
  const vv = window.visualViewport;
  const desiredTop = (vv?.offsetTop ?? 0) + 4;
  const delta = el.getBoundingClientRect().top - desiredTop;
  if (delta > 1) {
    window.scrollBy({ top: delta, left: 0, behavior: "auto" });
  }
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
  const hasQuery = value.trim().length > 0;

  useLayoutEffect(() => {
    if (!isMobileFilterViewport()) {
      document.documentElement.classList.remove("is-member-filtering");
      resumeScrollRef.current = null;
      return;
    }

    if (hasQuery) {
      // Capture once on enter so clear can restore the pre-search scroll spot.
      if (resumeScrollRef.current === null) {
        resumeScrollRef.current = window.scrollY;
      }
      document.documentElement.classList.add("is-member-filtering");
      pinFilterBar(barRef.current);

      const bar = barRef.current;
      const pin = () => pinFilterBar(bar);
      const stack = bar?.closest(".filter-stack");
      const ro =
        stack && typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(pin)
          : null;
      if (stack && ro) ro.observe(stack);

      window.visualViewport?.addEventListener("resize", pin);
      window.visualViewport?.addEventListener("scroll", pin);
      window.addEventListener("resize", pin);
      return () => {
        ro?.disconnect();
        window.visualViewport?.removeEventListener("resize", pin);
        window.visualViewport?.removeEventListener("scroll", pin);
        window.removeEventListener("resize", pin);
      };
    }

    // Cleared: reveal content above and put the user back where they were.
    document.documentElement.classList.remove("is-member-filtering");
    const resumeY = resumeScrollRef.current;
    resumeScrollRef.current = null;
    if (resumeY !== null) {
      window.scrollTo({ top: resumeY, left: 0, behavior: "auto" });
      // Second pass after layout fully restores sibling heights.
      requestAnimationFrame(() => {
        window.scrollTo({ top: resumeY, left: 0, behavior: "auto" });
      });
    }
    return undefined;
  }, [hasQuery, value]);

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
