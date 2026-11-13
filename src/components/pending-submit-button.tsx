"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
};

/** Must be rendered inside a <form> that uses a Server Action. */
export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  className = "btn-primary",
  style,
  disabled = false,
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      style={style}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <span className="btn-spinner" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        idleLabel
      )}
    </button>
  );
}
