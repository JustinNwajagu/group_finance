import Link from "next/link";
import {
  concludePaymentRequest,
  markPaymentPaid,
  markPaymentPledge,
  reopenPaymentRequest,
} from "@/app/actions/payments";
import { formatDate, formatMoney } from "@/lib/format";
import type { ContributionLists, MemberPaymentRow } from "@/lib/types";

function MemberList({
  title,
  members,
  empty,
}: {
  title: string;
  members: MemberPaymentRow[];
  empty: string;
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
  returnTo = "/members",
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
        />
        <MemberList
          title="Yet to contribute"
          members={outstanding}
          empty="Everyone has contributed."
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
            Admins can amend who contributed even after the concluded date.
          </p>

          {outstanding.some((m) => m.payment_id != null) ? (
            <div className="amend-row">
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Mark contributed:
              </span>
              {outstanding
                .filter((m) => m.payment_id != null)
                .map((m) => (
                  <form
                    key={m.payment_id}
                    action={markPaymentPaid}
                    className="inline-form"
                  >
                    <input type="hidden" name="id" value={m.payment_id!} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <button
                      type="submit"
                      className="btn-ghost"
                      style={{ padding: "0.25rem 0.55rem" }}
                    >
                      {m.name}
                    </button>
                  </form>
                ))}
            </div>
          ) : null}

          {contributed.some((m) => m.payment_id != null) ? (
            <div className="amend-row">
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Move to outstanding:
              </span>
              {contributed
                .filter((m) => m.payment_id != null)
                .map((m) => (
                  <form
                    key={m.payment_id}
                    action={markPaymentPledge}
                    className="inline-form"
                  >
                    <input type="hidden" name="id" value={m.payment_id!} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <button
                      type="submit"
                      className="btn-ghost"
                      style={{ padding: "0.25rem 0.55rem" }}
                    >
                      {m.name}
                    </button>
                  </form>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
