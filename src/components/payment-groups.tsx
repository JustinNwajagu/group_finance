import Link from "next/link";
import { markPaymentPaid } from "@/app/actions/payments";
import { formatDate, formatMoney, formatTimestamp } from "@/lib/format";
import type { PaymentTitleGroup } from "@/lib/group";
import type { PaymentWithMember } from "@/lib/types";

export function PaymentGroups({
  groups,
  showMember,
  isAdmin,
}: {
  groups: PaymentTitleGroup<PaymentWithMember>[];
  showMember: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="payment-groups">
      {groups.map((group) => (
        <section key={group.title} className="payment-group">
          <header className="payment-group-head">
            <h3>{group.title}</h3>
            <div className="payment-group-meta">
              <span>
                {group.payments.length}{" "}
                {group.payments.length === 1 ? "payment" : "payments"}
              </span>
              <strong className="money">{formatMoney(group.total)}</strong>
            </div>
          </header>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {showMember ? <th>Member</th> : null}
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Recorded</th>
                  {isAdmin ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {group.payments.map((p) => (
                  <tr key={p.id}>
                    {showMember ? (
                      <td>
                        <Link
                          className="row-link"
                          href={`/members/${p.member_id}`}
                        >
                          {p.member_name}
                        </Link>
                      </td>
                    ) : null}
                    <td className="money">{formatMoney(p.amount)}</td>
                    <td>
                      <span
                        className={
                          p.status === "paid"
                            ? "badge badge-paid"
                            : "badge badge-pledge"
                        }
                      >
                        {p.status === "paid" ? "Paid" : "Pledge"}
                      </span>
                    </td>
                    <td>{formatDate(p.payment_date)}</td>
                    <td className="muted">{formatTimestamp(p.created_at)}</td>
                    {isAdmin ? (
                      <td>
                        {p.status === "pledge" ? (
                          <form action={markPaymentPaid} className="inline-form">
                            <input type="hidden" name="id" value={p.id} />
                            <button
                              type="submit"
                              className="btn-ghost"
                              style={{ padding: "0.3rem 0.65rem" }}
                            >
                              Mark paid
                            </button>
                          </form>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
