"use client";

import { useEffect, type RefObject } from "react";

/**
 * When a panel opens, bring it on screen. Inside `.archive-boards-scroll`,
 * also re-pin after close so sibling title rows reappear in view.
 */
export function useScrollOpenIntoView(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const scroller = node.closest(
      ".archive-boards-scroll",
    ) as HTMLElement | null;

    const run = () => {
      if (scroller) {
        if (open) {
          scroller.scrollTop = 0;
          node.scrollIntoView({
            behavior: "auto",
            block: "nearest",
            inline: "nearest",
          });
          return;
        }
        node.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
        return;
      }
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
