"use client";

import { useEffect, useRef, type RefObject } from "react";

function canScrollY(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.overflowY === "auto" || style.overflowY === "scroll";
}

/**
 * When a panel opens, keep it on screen without yanking the page away from
 * the dashboard header on first load.
 *
 * - Skips the initial mount (default-open rows must not scroll the window).
 * - Inside `.archive-boards-scroll`, only scrolls that scroller while it is
 *   actually scrollable; when an open row makes it `overflow: visible`, leave
 *   the window alone.
 */
export function useScrollOpenIntoView(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
): void {
  const readyRef = useRef(false);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!readyRef.current) {
      readyRef.current = true;
      prevOpenRef.current = open;
      return;
    }

    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;

    const scroller = node.closest(
      ".archive-boards-scroll",
    ) as HTMLElement | null;

    const run = () => {
      if (scroller && canScrollY(scroller)) {
        if (open) {
          scroller.scrollTop = 0;
          const scrollerTop = scroller.getBoundingClientRect().top;
          const nodeTop = node.getBoundingClientRect().top;
          scroller.scrollTop = Math.max(
            0,
            scroller.scrollTop + (nodeTop - scrollerTop),
          );
          return;
        }
        const scrollerTop = scroller.getBoundingClientRect().top;
        const nodeTop = node.getBoundingClientRect().top;
        scroller.scrollTop = Math.max(
          0,
          scroller.scrollTop + (nodeTop - scrollerTop),
        );
        return;
      }

      // Expanded open row uses overflow:visible on the list — do not scroll
      // the window, or the page header disappears (desktop and mobile).
      if (scroller) return;

      if (!open) return;
      node.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    };

    run();
    const frame = window.requestAnimationFrame(run);
    return () => window.cancelAnimationFrame(frame);
  }, [open, ref]);
}
