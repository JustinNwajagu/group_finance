"use client";

import { useState } from "react";
import { approveAccessRequest } from "@/app/actions/access-requests";
import type { Member } from "@/lib/types";

export function ApproveAccessForm({
  requestId,
  unlinkable,
  atLoginCap,
}: {
  requestId: number;
  unlinkable: Member[];
  atLoginCap: boolean;
}) {
  const [mode, setMode] = useState("");
  const [memberId, setMemberId] = useState("");
  const linkDisabled = unlinkable.length === 0 || atLoginCap;
  const needsMember = mode === "link";

  return (
    <form
      action={approveAccessRequest}
      className="form-grid"
      onSubmit={(event) => {
        if (mode !== "link" && mode !== "create") {
          event.preventDefault();
          window.alert("Choose link to an existing member or create a new member.");
          return;
        }
        if (mode === "link" && !memberId) {
          event.preventDefault();
          window.alert("Select an existing member to link this login to.");
        }
      }}
    >
      <input type="hidden" name="id" value={requestId} />
      <label className="field">
        Link login to
        <select
          name="link_mode"
          required
          value={mode}
          onChange={(e) => {
            const next = e.target.value;
            setMode(next);
            if (next !== "link") setMemberId("");
          }}
        >
          <option value="" disabled>
            Choose…
          </option>
          <option value="link" disabled={linkDisabled}>
            Existing member
            {unlinkable.length === 0
              ? " (none available)"
              : atLoginCap
                ? " (login limit reached)"
                : ""}
          </option>
          <option value="create">Create new member</option>
        </select>
      </label>
      <label className="field">
        Existing member
        <select
          name="member_id"
          value={memberId}
          required={needsMember}
          disabled={!needsMember || unlinkable.length === 0}
          onChange={(e) => setMemberId(e.target.value)}
        >
          <option value="" disabled>
            {needsMember
              ? "Select member without a login"
              : "Only needed when linking an existing member"}
          </option>
          {unlinkable.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.email ? ` · ${m.email}` : ""}
              {m.phone ? ` · ${m.phone}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="submit" className="btn-primary">
          Approve &amp; create login
        </button>
      </div>
    </form>
  );
}
