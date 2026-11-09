"use client";

import { useFormStatus } from "react-dom";

/**
 * Marks the parent <form> with aria-busy while a Server Action runs.
 * Render as a child inside the form.
 */
export function FormBusyMarker() {
  const { pending } = useFormStatus();
  return (
    <span
      hidden
      ref={(node) => {
        const form = node?.closest("form");
        if (!form) return;
        if (pending) form.setAttribute("aria-busy", "true");
        else form.removeAttribute("aria-busy");
      }}
    />
  );
}
