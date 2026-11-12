"use client";

import { updateMemberNameAction } from "@/app/actions/members";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ROSTER_TITLES } from "@/lib/name-titles";

export function EditMemberNameForm({
  memberId,
  title,
  name,
}: {
  memberId: number;
  title: string;
  name: string;
}) {
  return (
    <form action={updateMemberNameAction} className="form-grid two">
      <input type="hidden" name="member_id" value={memberId} />
      <label className="field">
        Title
        <select name="title" defaultValue={title}>
          <option value="">No title</option>
          {ROSTER_TITLES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {title &&
          !(ROSTER_TITLES as readonly string[]).includes(title) ? (
            <option value={title}>{title}</option>
          ) : null}
        </select>
      </label>
      <label className="field">
        Name
        <input
          name="name"
          required
          defaultValue={name}
          autoComplete="off"
        />
      </label>
      <div style={{ gridColumn: "1 / -1" }}>
        <PendingSubmitButton
          idleLabel="Save name"
          pendingLabel="Saving…"
        />
      </div>
    </form>
  );
}
