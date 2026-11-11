"use client";

import type { ReactNode } from "react";

/** Server-action form that asks for confirmation before submit. */
export function ConfirmActionForm({
  action,
  message,
  className,
  style,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      style={style}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}
