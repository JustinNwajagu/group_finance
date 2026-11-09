"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  style?: React.CSSProperties;
};

/** Must be rendered inside a <form> that uses a Server Action. */
export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  className = "btn-primary",
  style,
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      style={style}
      disabled={pending}
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

/** Status line under a form while the Server Action runs. */
export function FormPendingStatus({ message }: { message: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className="form-pending" role="status" aria-live="polite">
      <span className="btn-spinner" aria-hidden />
      {message}
    </p>
  );
}
