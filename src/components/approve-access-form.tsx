"use client";

import { approveAccessRequest } from "@/app/actions/access-requests";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function ApproveAccessForm({
  requestId,
  kind,
  claimedMemberName,
  atLoginCap,
}: {
  requestId: number;
  kind: "claim" | "new";
  claimedMemberName?: string | null;
  atLoginCap: boolean;
}) {
  const blocked = atLoginCap && kind === "claim";

  return (
    <form action={approveAccessRequest} className="access-approve-row">
      <input type="hidden" name="id" value={requestId} />
      <p className="muted" style={{ margin: 0 }}>
        {kind === "claim" ? (
          <>
            Claims roster member{" "}
            <strong>{claimedMemberName || "Unknown"}</strong>. Confirm they are
            legitimate, then approve to link this login.
          </>
        ) : (
          <>
            Asked to join as a <strong>new member</strong>. Confirm they are
            legitimate, then approve to add them to the roster and create their
            login.
          </>
        )}
      </p>
      {blocked ? (
        <p className="form-error" role="alert" style={{ margin: 0 }}>
          Login limit reached — free a login or add roster capacity first.
        </p>
      ) : null}
      <PendingSubmitButton
        idleLabel={
          kind === "new" ? "Approve & create member" : "Approve & link login"
        }
        pendingLabel="Approving…"
        disabled={blocked}
      />
    </form>
  );
}
