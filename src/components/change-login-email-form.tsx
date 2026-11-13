"use client";

import { useState } from "react";
import { changeMemberLoginEmail } from "@/app/actions/access-requests";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function ChangeLoginEmailForm({
  memberId,
  currentEmail,
}: {
  memberId: number;
  currentEmail: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem" }}
        onClick={() => setOpen(true)}
      >
        Change email
      </button>
    );
  }

  return (
    <form action={changeMemberLoginEmail} className="change-email-form">
      <input type="hidden" name="member_id" value={memberId} />
      <label className="field change-email-field">
        <span className="sr-only">New login email</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={currentEmail}
          autoComplete="off"
          placeholder="new@email.com"
        />
      </label>
      <div className="change-email-actions">
        <PendingSubmitButton
          className="btn-ghost"
          style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem" }}
          idleLabel="Save & reset"
          pendingLabel="Updating…"
        />
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem" }}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
