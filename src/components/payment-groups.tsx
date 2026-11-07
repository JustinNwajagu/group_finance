import Link from "next/link";
import { formatDate, formatMoney, formatTimestamp } from "@/lib/format";
import type { PaymentTitleGroup } from "@/lib/group";
import type { PaymentWithMember } from "@/lib/types";

export function PaymentGroups({
  groups,
  showMember,
}: {
  groups: PaymentTitleGroup<PaymentWithMember>[];
  showMember: boolean;
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
                  <th>Date</th>
                  <th>Recorded</th>
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
                    <td>{formatDate(p.payment_date)}</td>
                    <td className="muted">{formatTimestamp(p.created_at)}</td>
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
