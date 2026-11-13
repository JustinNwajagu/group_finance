"use client";

import { useEffect, type RefObject } from "react";

/** When a panel opens, bring its container onto the screen (no overshoot). */
export function useScrollOpenIntoView(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    node.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [open, ref]);
}
