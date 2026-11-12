"use client";

import { useEffect, useState } from "react";

const FLASH_PARAMS = [
  "error",
  "ok",
  "link",
  "name",
  "count",
  "title",
] as const;

function stripFlashParams(url: URL) {
  for (const key of FLASH_PARAMS) url.searchParams.delete(key);
}

function pathWithQuery(url: URL) {
  const qs = url.searchParams.toString();
  return qs ? `${url.pathname}?${qs}` : url.pathname;
}

function isReloadNavigation() {
  try {
    const entries = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    if (entries[0]?.type === "reload") return true;
  } catch {
    /* ignore */
  }
  try {
    return (
      typeof performance !== "undefined" &&
      "navigation" in performance &&
      (performance as Performance & { navigation?: { type?: number } })
        .navigation?.type === 1
    );
  } catch {
    return false;
  }
}

export function Flash({
  ok,
  error,
  messages,
}: {
  ok?: string;
  error?: string;
  messages: Record<string, string>;
}) {
  const [content, setContent] = useState<{
    kind: "error" | "ok";
    text: string;
  } | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasFlash =
      url.searchParams.has("error") || url.searchParams.has("ok");
    const reload = isReloadNavigation();

    if (reload && hasFlash) {
      // Reload clears previous flash so the user can try again cleanly.
      stripFlashParams(url);
      window.history.replaceState({}, "", pathWithQuery(url));
      return;
    }

    if (error) {
      setContent({ kind: "error", text: error });
    } else if (ok && messages[ok]) {
      setContent({ kind: "ok", text: messages[ok] });
    }

    if (hasFlash) {
      stripFlashParams(url);
      window.history.replaceState({}, "", pathWithQuery(url));
    }
    // Mount-only: flash comes from the request URL for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!content) return null;

  if (content.kind === "error") {
    return (
      <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
        {content.text}
      </p>
    );
  }

  return (
    <p className="form-ok" role="status" style={{ marginBottom: "1rem" }}>
      {content.text}
    </p>
  );
}
