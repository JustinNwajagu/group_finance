import Link from "next/link";
import type { ReactNode } from "react";
import {
  clearMemberContribution,
  concludePaymentRequest,
  reopenPaymentRequest,
} from "@/app/actions/payments";
import { ContributeDialog } from "@/components/contribute-dialog";
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
            <li key={m.id}>
              <Link className="row-link" href={`/members/${m.id}`}>
                {m.name}
              </Link>
              {m.email ? <span className="muted"> · {m.email}</span> : null}
              {m.status ? (
                <span
                  className={
                    m.status === "paid" ? "badge badge-paid" : "badge badge-pledge"
                  }
                  style={{ marginLeft: "0.4rem" }}
                >
                  {m.status === "paid" ? "Paid" : "Pledge"}
                </span>
              ) : null}
              {m.amount ? (
                <span className="muted"> · {formatMoney(m.amount)}</span>
              ) : null}
              {renderExtra?.(m)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ContributionBoard({
  board,
  isAdmin,
  returnTo = "/payments",
}: {
  board: ContributionLists;
  isAdmin: boolean;
  returnTo?: string;
}) {
  const { request, contributed, outstanding } = board;
  const concluded = Boolean(request.concluded_at);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <article className="contrib-board">
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
        </div>
        <span className={concluded ? "badge badge-paid" : "badge badge-pledge"}>
          {concluded ? "Concluded" : "Current"}
        </span>
      </header>

      <div className="contrib-split">
        <MemberList
          title="Contributed"
          members={contributed}
          empty="No contributions yet."
          renderExtra={
            isAdmin
              ? (m) =>
                  m.payment_id != null ? (
                    <span
                      className="amend-row"
                      style={{ display: "inline-flex", marginLeft: "0.5rem" }}
                    >
                      {m.status === "pledge" ? (
                        <ContributeDialog
                          requestId={request.id}
                          requestTitle={request.title}
                          minAmount={request.amount}
                          memberId={m.id}
                          memberName={m.name}
                          returnTo={returnTo}
                          paymentId={m.payment_id}
                          defaultAmount={m.amount}
                          defaultStatus="paid"
                          defaultDate={today}
                          triggerLabel="Mark paid"
                        />
                      ) : (
                        <ContributeDialog
                          requestId={request.id}
                          requestTitle={request.title}
                          minAmount={request.amount}
                          memberId={m.id}
                          memberName={m.name}
                          returnTo={returnTo}
                          paymentId={m.payment_id}
                          defaultAmount={m.amount}
                          defaultStatus="pledge"
                          triggerLabel="Mark pledge"
                        />
                      )}
                      <form
                        action={clearMemberContribution}
                        className="inline-form"
                      >
                        <input type="hidden" name="id" value={m.payment_id} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <button
                          type="submit"
                          className="btn-ghost"
                          style={{ padding: "0.15rem 0.45rem" }}
                        >
                          Clear
                        </button>
                      </form>
                    </span>
                  ) : null
              : undefined
          }
        />
        <MemberList
          title="Yet to contribute"
          members={outstanding}
          empty="Everyone has contributed."
          renderExtra={
            isAdmin
              ? (m) => (
                  <span
                    className="amend-row"
                    style={{ display: "inline-flex", marginLeft: "0.5rem" }}
                  >
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
                  </span>
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
              style={{ gap: "0.5rem", flexWrap: "wrap" }}
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
              <button type="submit" className="btn-primary">
                Conclude payment
              </button>
            </form>
          ) : (
            <form action={reopenPaymentRequest} className="inline-form">
              <input type="hidden" name="id" value={request.id} />
              <button type="submit" className="btn-ghost">
                Clear concluded date
              </button>
            </form>
          )}

          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Add pledge / Mark paid opens a form for amount (and date when paid).
            Clear removes the record so the member is outstanding again.
          </p>
        </div>
      ) : null}
    </article>
  );
}
