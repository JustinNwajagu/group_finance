"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions/members";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

function SubmitButton({
  children,
  pendingLabel = "Saving…",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  className,
  successMessage,
  submitLabel,
  pendingLabel,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
  submitLabel: string;
  pendingLabel?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state && !state.ok ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok && successMessage ? (
        <p className="form-ok" role="status">
          {successMessage}
        </p>
      ) : null}
      <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
    </form>
  );
}

export function RoleForm({
  action,
  id,
  role,
}: {
  action: Action;
  id: number;
  role: string;
}) {
  const [, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <select
        name="role"
        defaultValue={role}
        className="select-compact"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Role"
      >
        <option value="admin">Admin</option>
        <option value="member">Member</option>
        <option value="pending">Pending</option>
      </select>
    </form>
  );
}
