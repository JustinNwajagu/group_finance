"use client";

import { useEffect, useRef } from "react";
import {
  signOutDueToInactivity,
  touchSessionActivity,
} from "@/app/actions/auth";
import { LAST_ACTIVE_COOKIE } from "@/lib/session-idle-client";

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
  "mousemove",
];

function readLastActive(): number {
  if (typeof document === "undefined") return 0;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LAST_ACTIVE_COOKIE}=`));
  if (!match) return 0;
  const value = Number(decodeURIComponent(match.split("=").slice(1).join("=")));
  return Number.isFinite(value) ? value : 0;
}

function writeLastActive(when = Date.now()) {
  const maxAge = 14 * 24 * 60 * 60;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${LAST_ACTIVE_COOKIE}=${when}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function SessionIdleGuard({ idleMs }: { idleMs: number }) {
  const signingOut = useRef(false);
  const lastBump = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(idleMs) || idleMs < 60_000) return;

    const expireIfIdle = async () => {
      if (signingOut.current) return;
      const last = readLastActive();
      if (!last || Date.now() - last <= idleMs) return;
      signingOut.current = true;
      await signOutDueToInactivity();
    };

    const bump = () => {
      const now = Date.now();
      // Throttle cookie writes / server touches.
      if (now - lastBump.current < 15_000) return;
      lastBump.current = now;
      writeLastActive(now);
      void touchSessionActivity().catch(() => {
        /* ignore offline/network */
      });
    };

    // Establish activity for this visit.
    if (!readLastActive()) writeLastActive();
    lastBump.current = Date.now();

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, bump, { passive: true });
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void expireIfIdle().then(() => {
          if (!signingOut.current) bump();
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const timer = window.setInterval(() => {
      void expireIfIdle();
    }, 30_000);

    void expireIfIdle();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, bump);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [idleMs]);

  return null;
}
