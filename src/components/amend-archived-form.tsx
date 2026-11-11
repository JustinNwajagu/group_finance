"use client";

import { useState } from "react";
import { FormBusyMarker } from "@/components/action-form";
import {
  FormPendingStatus,
  PendingSubmitButton,
} from "@/components/pending-submit-button";
import { formatDate, formatMoney, todayIsoDate } from "@/lib/format";
import type { Member, PaymentRequest, PaymentStatus } from "@/lib/types";

export type ExistingContribution = {
  amount: string;
  status: PaymentStatus;
  payment_date: string | null;
  notes: string | null;
};

type AmendStatus = PaymentStatus | "outstanding";

type Props = {
  action: (formData: FormData) => Promise<void>;
  requests: PaymentRequest[];
  members: Member[];
  /** Keyed as `${payment_request_id}:${member_id}` */
  existing: Record<string, ExistingContribution>;
  today: string;
};

function lookupKey(requestId: string, memberId: string) {
  return `${requestId}:${memberId}`;
}

export function AmendArchivedForm({
  action,
  requests,
  members,
  existing,
  today,
}: Props) {
  const maxDate = today || todayIsoDate();
  const [requestId, setRequestId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<AmendStatus>("outstanding");
  const [paymentDate, setPaymentDate] = useState(today);
  const [notes, setNotes] = useState("");

  function backfill(nextRequestId: string, nextMemberId: string) {
    if (!nextRequestId || !nextMemberId) return;
    const row = existing[lookupKey(nextRequestId, nextMemberId)];
    if (row) {
      setAmount(row.amount);
      setStatus(row.status);
      setPaymentDate(row.payment_date ?? "");
      setNotes(row.notes ?? "");
      return;
    }
    const request = requests.find((r) => String(r.id) === nextRequestId);
    setAmount(request?.amount ?? "");
    setStatus("outstanding");
    setPaymentDate("");
    setNotes("");
  }

  const outstanding = status === "outstanding";

  return (
    <form action={action} className="form-grid">
      <FormBusyMarker />
      <input type="hidden" name="return_to" value="/archive" />
      <label className="field">
        Payment title
        <select
          name="payment_request_id"
          required
          value={requestId}
          onChange={(e) => {
            const next = e.target.value;
            setRequestId(next);
            backfill(next, memberId);
          }}
        >
          <option value="" disabled>
            Select archived payment
          </option>
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} · min {formatMoney(r.amount)} · concluded{" "}
              {r.concluded_at ? formatDate(r.concluded_at.slice(0, 10)) : "—"}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Member
        <select
          name="member_id"
          required
          value={memberId}
          onChange={(e) => {
            const next = e.target.value;
            setMemberId(next);
            backfill(requestId, next);
          }}
        >
          <option value="" disabled>
            Select member
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid two">
        <label className="field">
          Amount (₦)
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required={!outstanding}
            disabled={outstanding}
            placeholder="0.00"
            value={outstanding ? "" : amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="field">
          Status
          <select
            name="status"
            value={status}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "paid" || next === "pledge" || next === "outstanding") {
                setStatus(next);
              }
            }}
          >
            <option value="outstanding">Not yet contributed</option>
            <option value="pledge">Pledge</option>
            <option value="paid">Paid</option>
          </select>
        </label>
      </div>
      <label className="field">
        Payment date{outstanding ? " (n/a)" : status === "paid" ? "" : " (optional)"}
        <input
          name="payment_date"
          type="date"
          max={maxDate}
          disabled={outstanding}
          required={!outstanding && status === "paid"}
          value={outstanding ? "" : paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />
      </label>
      <label className="field">
        Notes (optional)
        <textarea
          name="notes"
          rows={2}
          placeholder="Bank transfer ref, cash collector, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={outstanding}
        />
      </label>
      {outstanding ? (
        <p className="muted" style={{ margin: 0 }}>
          Saves this member as not yet contributed (clears any pledge or paid
          record for this archived payment).
        </p>
      ) : null}
      <FormPendingStatus message="Saving contribution…" />
      <PendingSubmitButton
        idleLabel={outstanding ? "Mark not yet contributed" : "Save contribution"}
        pendingLabel="Saving…"
      />
    </form>
  );
}
