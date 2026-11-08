"use client";

import { useEffect, useId, useRef, useState } from "react";
import { saveBoardContribution } from "@/app/actions/payments";
import { formatMoney } from "@/lib/format";
import type { PaymentStatus } from "@/lib/types";

type ContributeDialogProps = {
  requestId: number;
  requestTitle: string;
  minAmount: string;
  memberId: number;
  memberName: string;
  returnTo: string;
  /** Existing payment row when editing / switching status. */
  paymentId?: number | null;
  defaultAmount?: string | null;
  defaultStatus: PaymentStatus;
  defaultDate?: string | null;
  defaultNotes?: string | null;
  triggerLabel: string;
};

export function ContributeDialog({
  requestId,
  requestTitle,
  minAmount,
  memberId,
  memberName,
  returnTo,
  paymentId,
  defaultAmount,
  defaultStatus,
  defaultDate,
  defaultNotes,
  triggerLabel,
}: ContributeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const amountDefault = defaultAmount && Number(defaultAmount) > 0
    ? defaultAmount
    : minAmount;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "0.15rem 0.45rem" }}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        className="contrib-dialog"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
      >
        <form action={saveBoardContribution} className="contrib-dialog-panel">
          <div className="contrib-dialog-head">
            <h3 id={titleId}>{triggerLabel}</h3>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: "0.2rem 0.5rem" }}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <p className="muted" style={{ margin: 0 }}>
            {memberName} · {requestTitle}
            <br />
            Minimum {formatMoney(minAmount)}
          </p>

          <input type="hidden" name="payment_request_id" value={requestId} />
          <input type="hidden" name="member_id" value={memberId} />
          <input type="hidden" name="return_to" value={returnTo} />
          {paymentId != null ? (
            <input type="hidden" name="payment_id" value={paymentId} />
          ) : null}
          <input type="hidden" name="status" value={defaultStatus} />

          <div className="form-grid two">
            <label className="field">
              Amount (₦)
              <input
                name="amount"
                type="number"
                min={minAmount}
                step="0.01"
                required
                defaultValue={amountDefault}
              />
            </label>
            <label className="field">
              Status
              <input
                type="text"
                readOnly
                value={defaultStatus === "paid" ? "Paid" : "Pledge"}
                aria-label="Status"
              />
            </label>
          </div>

          <label className="field">
            Payment date{defaultStatus === "paid" ? "" : " (optional)"}
            <input
              name="payment_date"
              type="date"
              defaultValue={defaultDate || (defaultStatus === "paid" ? today : "")}
              required={defaultStatus === "paid"}
            />
          </label>

          <label className="field">
            Notes (optional)
            <textarea
              name="notes"
              rows={2}
              defaultValue={defaultNotes ?? ""}
              placeholder="Bank transfer ref, cash collector, etc."
            />
          </label>

          <div className="contrib-dialog-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save contribution
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
