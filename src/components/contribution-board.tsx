import Link from "next/link";
import type { ReactNode } from "react";
import {
  clearMemberContribution,
  concludePaymentRequest,
  deletePaymentRequest,
  reopenPaymentRequest,
} from "@/app/actions/payments";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { ContributeDialog } from "@/components/contribute-dialog";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { formatDate, formatMoney } from "@/lib/format";
import type { ContributionLists, MemberPaymentRow } from "@/lib/types";

function MemberList({
  title,
  members,
  empty,
  renderExtra,
}: {
  title: string;
  members: MemberPaymentRow[];
  empty: string;
  renderExtra?: (m: MemberPaymentRow) => ReactNode;
}) {
  return (
    <div className="contrib-list">
      <h4>
        {title}{" "}
        <span className="muted" style={{ fontWeight: 500 }}>
          ({members.length})
        </span>
      </h4>
      {members.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {empty}
        </p>
      ) : (
        <ul className="name-list">
          {members.map((m) => (
            <li key={m.id} className="name-list-item">
              <div className="name-list-meta">
                <Link className="row-link" href={`/members/${m.id}`}>
                  {m.name}
                </Link>
                {m.status ? (
                  <span
                    className={
                      m.status === "paid"
                        ? "badge badge-paid"
                        : "badge badge-pledge"
                    }
                    style={{ marginLeft: "0.4rem" }}
                  >
                    {m.status === "paid" ? "Paid" : "Pledge"}
                  </span>
                ) : null}
                {m.amount ? (
                  <span className="muted"> · {formatMoney(m.amount)}</span>
                ) : null}
                {m.notes ? (
                  <span className="muted"> · {m.notes}</span>
                ) : null}
              </div>
              {renderExtra?.(m)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecordActions({
  requestId,
  requestTitle,
  minAmount,
  member,
  returnTo,
  today,
}: {
  requestId: number;
  requestTitle: string;
  minAmount: string;
  member: MemberPaymentRow;
  returnTo: string;
  today: string;
}) {
  if (member.payment_id == null) return null;
  return (
    <div className="amend-row">
      {member.status === "pledge" ? (
        <ContributeDialog
          requestId={requestId}
          requestTitle={requestTitle}
          minAmount={minAmount}
          memberId={member.id}
          memberName={member.name}
          returnTo={returnTo}
          paymentId={member.payment_id}
          defaultAmount={member.amount}
          defaultStatus="paid"
          defaultDate={today}
          defaultNotes={member.notes}
          triggerLabel="Mark paid"
        />
      ) : (
        <ContributeDialog
          requestId={requestId}
          requestTitle={requestTitle}
          minAmount={minAmount}
          memberId={member.id}
          memberName={member.name}
          returnTo={returnTo}
          paymentId={member.payment_id}
          defaultAmount={member.amount}
          defaultStatus="pledge"
          defaultNotes={member.notes}
          triggerLabel="Mark pledge"
        />
      )}
      <form action={clearMemberContribution} className="inline-form">
        <input type="hidden" name="id" value={member.payment_id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <PendingSubmitButton
          className="btn-ghost"
          style={{ padding: "0.15rem 0.45rem" }}
          idleLabel="Clear"
          pendingLabel="Clearing…"
        />
      </form>
    </div>
  );
}

export function ContributionBoard({
  board,
  isAdmin,
  returnTo = "/payments",
  hideHeader = false,
}: {
  board: ContributionLists;
  isAdmin: boolean;
  returnTo?: string;
  /** When true, skip the title header (used inside archive accordion). */
  hideHeader?: boolean;
}) {
  const {
    request,
    contributed,
    pledged,
    outstanding,
    pledge_total,
    realised_total,
  } = board;
  const concluded = Boolean(request.concluded_at);
  const today = new Date().toISOString().slice(0, 10);
  const outstandingTitle = concluded ? "Didn't contribute" : "Yet to contribute";
  const outstandingEmpty = concluded
    ? "No one left without a record."
    : "Everyone has a pledge or payment.";
  const hasMemberPayments = contributed.length + pledged.length > 0;

  return (
    <article className={`contrib-board${hideHeader ? " contrib-board-embedded" : ""}`}>
      {hideHeader ? null : (
        <header className="contrib-board-head">
          <div>
            <h3>{request.title}</h3>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              Expected {formatMoney(request.amount)} · Deadline{" "}
              {formatDate(request.deadline)}
              {concluded && request.concluded_at
                ? ` · Concluded ${formatDate(request.concluded_at.slice(0, 10))}`
                : " · Open"}
            </p>
            <div className="totals-line">
              <span>
                Pledges <strong>{formatMoney(pledge_total)}</strong>
              </span>
              <span className="totals-sep" aria-hidden="true">
                ·
              </span>
              <span>
                Realised <strong>{formatMoney(realised_total)}</strong>
                <span className="muted"> · paid only</span>
              </span>
            </div>
          </div>
          <span
            className={concluded ? "badge badge-paid" : "badge badge-pledge"}
          >
            {concluded ? "Concluded" : "Current"}
          </span>
        </header>
      )}

      <div className="contrib-split contrib-split-3">
        <MemberList
          title="Contributed"
          members={contributed}
          empty="No paid contributions yet."
          renderExtra={
            isAdmin
              ? (m) => (
                  <RecordActions
                    requestId={request.id}
                    requestTitle={request.title}
                    minAmount={request.amount}
                    member={m}
                    returnTo={returnTo}
                    today={today}
                  />
                )
              : undefined
          }
        />
        <MemberList
          title="Pledged"
          members={pledged}
          empty="No pledges."
          renderExtra={
            isAdmin
              ? (m) => (
                  <RecordActions
                    requestId={request.id}
                    requestTitle={request.title}
                    minAmount={request.amount}
                    member={m}
                    returnTo={returnTo}
                    today={today}
                  />
                )
              : undefined
          }
        />
        <MemberList
          title={outstandingTitle}
          members={outstanding}
          empty={outstandingEmpty}
          renderExtra={
            isAdmin
              ? (m) => (
                  <div className="amend-row">
                    <ContributeDialog
                      requestId={request.id}
                      requestTitle={request.title}
                      minAmount={request.amount}
                      memberId={m.id}
                      memberName={m.name}
                      returnTo={returnTo}
                      defaultStatus="pledge"
                      triggerLabel="Add pledge"
                    />
                    <ContributeDialog
                      requestId={request.id}
                      requestTitle={request.title}
                      minAmount={request.amount}
                      memberId={m.id}
                      memberName={m.name}
                      returnTo={returnTo}
                      defaultStatus="paid"
                      defaultDate={today}
                      triggerLabel="Mark paid"
                    />
                  </div>
                )
              : undefined
          }
        />
      </div>

      {isAdmin ? (
        <div className="contrib-admin">
          {!concluded ? (
            <form
              action={concludePaymentRequest}
              className="inline-form"
              style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}
            >
              <input type="hidden" name="id" value={request.id} />
              <input type="hidden" name="return_to" value="/archive" />
              <label className="field" style={{ margin: 0 }}>
                Conclude date
                <input
                  name="concluded_date"
                  type="date"
                  defaultValue={today}
                  required
                />
              </label>
              <label
                className="expense-kind-option"
                style={{ marginBottom: "0.35rem" }}
              >
                <input type="checkbox" name="transfer_to_bank" value="1" />
                Transfer remaining balance to bank
              </label>
              <PendingSubmitButton
                idleLabel="Conclude payment"
                pendingLabel="Concluding…"
              />
            </form>
          ) : (
            <form action={reopenPaymentRequest} className="inline-form">
              <input type="hidden" name="id" value={request.id} />
              <PendingSubmitButton
                className="btn-ghost"
                idleLabel="Clear concluded date"
                pendingLabel="Reopening…"
              />
            </form>
          )}

          {hasMemberPayments ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              This contribution has member payments, so it cannot be removed.
              Clear those records first if it was created by mistake.
            </p>
          ) : (
            <ConfirmActionForm
              action={deletePaymentRequest}
              message={`Permanently delete “${request.title}”? This cannot be undone.`}
              className="inline-form"
            >
              <input type="hidden" name="id" value={request.id} />
              <input type="hidden" name="return_to" value={returnTo} />
              <PendingSubmitButton
                className="btn-ghost"
                idleLabel="Remove contribution"
                pendingLabel="Removing…"
              />
            </ConfirmActionForm>
          )}

          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Contributed means paid only. Pledges stay in Pledged and do not count
            toward contributions or realised totals.
          </p>
        </div>
      ) : null}
    </article>
  );
}
