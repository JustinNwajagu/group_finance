"use client";

import { updateMemberNameAction } from "@/app/actions/members";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ScrollSelect } from "@/components/scroll-select";
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
        <ScrollSelect
          name="title"
          defaultValue={title}
          placeholder="No title"
          options={[
            { value: "", label: "No title" },
            ...ROSTER_TITLES.map((option) => ({
              value: option,
              label: option,
            })),
            ...(title && !(ROSTER_TITLES as readonly string[]).includes(title)
              ? [{ value: title, label: title }]
              : []),
          ]}
        />
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
