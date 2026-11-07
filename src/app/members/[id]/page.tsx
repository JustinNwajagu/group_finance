import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAccess } from "@/lib/auth";
import {
  getMember,
  listPaymentsForMember,
  memberContribution,
} from "@/lib/data";
import { formatDate, formatMoney, formatTimestamp } from "@/lib/format";

export const instant = false;

export default async function MemberDetailPage({
  params,
}: PageProps<"/members/[id]">) {
  await connection();
  const viewer = await requireAccess();
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id)) notFound();

  const member = await getMember(id);
  if (!member) notFound();

  const [payments, total] = await Promise.all([
    listPaymentsForMember(id),
    memberContribution(id),
  ]);

  return (
    <AppShell viewer={viewer} active="members">
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/members">← Members</Link>
          </p>
          <h1>{member.name}</h1>
          <p>{member.email || "No email on file"}</p>
          <div className="stat-line">
            <div>
              <strong>{formatMoney(total)}</strong>
              <span>Contribution total</span>
            </div>
            <div>
              <strong>{payments.length}</strong>
              <span>Payments</span>
            </div>
          </div>
        </div>
      </div>

      <section className="panel">
        <h2>Payments made</h2>
        {payments.length === 0 ? (
          <div className="hero-empty">No payments recorded for this member.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td className="money">{formatMoney(p.amount)}</td>
                    <td>{formatDate(p.payment_date)}</td>
                    <td className="muted">{formatTimestamp(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
