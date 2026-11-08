import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PaymentGroups } from "@/components/payment-groups";
import { requireAccess, isAdmin } from "@/lib/auth";
import {
  getMember,
  listPaymentsForMember,
  memberContribution,
  memberPaymentStats,
} from "@/lib/data";
import { memberDuesSummary } from "@/lib/dues-data";
import { DUES_MONTH_LABELS } from "@/lib/dues-months";
import { formatMoney } from "@/lib/format";
import { groupPaymentsByTitle } from "@/lib/group";

export const instant = false;

export default async function MemberDetailPage({
  params,
}: PageProps<"/members/[id]">) {
  await connection();
  const viewer = await requireAccess();
  const admin = isAdmin(viewer);
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id)) notFound();

  const member = await getMember(id);
  if (!member) notFound();

  const [payments, paidTotal, stats, duesYears] = await Promise.all([
    listPaymentsForMember(id),
    memberContribution(id),
    memberPaymentStats(id),
    memberDuesSummary(id),
  ]);
  const groups = groupPaymentsByTitle(payments);

  return (
    <AppShell viewer={viewer} active="home">
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/">← Home</Link>
          </p>
          <h1>{member.name}</h1>
          <p>{member.email || "No email on file"}</p>
          <div className="stat-line">
            <div>
              <strong>{stats.payment_count}</strong>
              <span>Requested payments</span>
            </div>
            <div>
              <strong>{stats.contribution_count}</strong>
              <span>Contributions (paid)</span>
            </div>
            <div>
              <strong>{formatMoney(paidTotal)}</strong>
              <span>Paid total (₦)</span>
            </div>
          </div>
        </div>
      </div>

      <section className="panel">
        <h2>Contributions by title</h2>
        {payments.length === 0 ? (
          <div className="hero-empty">
            No contribution payments recorded for this member.
          </div>
        ) : (
          <PaymentGroups groups={groups} showMember={false} isAdmin={admin} />
        )}
      </section>

      <section className="panel">
        <h2>Dues</h2>
        {duesYears.length === 0 ? (
          <div className="hero-empty">No dues years opened yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data dues-grid">
              <thead>
                <tr>
                  <th>Year</th>
                  {DUES_MONTH_LABELS.map((label) => (
                    <th key={label} className="dues-month">
                      {label}
                    </th>
                  ))}
                  <th className="num">Paid</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {duesYears.map((year) => (
                  <tr key={year.schedule.id}>
                    <td>
                      <Link
                        className="row-link"
                        href={`/dues?year=${year.schedule.year}`}
                      >
                        {year.schedule.year}
                      </Link>
                    </td>
                    {year.months_paid.map((paid, i) => (
                      <td
                        key={DUES_MONTH_LABELS[i]}
                        className={paid ? "dues-month dues-paid" : "dues-month"}
                      >
                        {paid ? "●" : "·"}
                      </td>
                    ))}
                    <td className="num">{year.months_count}/12</td>
                    <td>{formatMoney(year.amount_paid)}</td>
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
