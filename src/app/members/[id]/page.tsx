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
import {
  DUES_MONTH_LABELS,
  formatCoveredMonths,
  formatDuesCount,
} from "@/lib/dues-months";
import { formatDate, formatMoney } from "@/lib/format";
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

  const [payments, paidTotal, stats, dues] = await Promise.all([
    listPaymentsForMember(id),
    memberContribution(id),
    memberPaymentStats(id),
    memberDuesSummary(id),
  ]);
  const groups = groupPaymentsByTitle(payments);
  const viewerEmail = viewer.email.trim().toLowerCase();
  const isSelf =
    (member.login_email ?? "").trim().toLowerCase() === viewerEmail ||
    (member.email ?? "").trim().toLowerCase() === viewerEmail;
  const showContact = admin || isSelf;
  const contactBits = showContact
    ? [
        member.email || null,
        member.phone || null,
        member.login_email && member.login_email !== member.email
          ? `Login ${member.login_email}`
          : null,
      ].filter(Boolean)
    : [];

  return (
    <AppShell viewer={viewer} active="home">
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/">← Home</Link>
          </p>
          <h1>{member.name}</h1>
          {showContact ? (
            <p>
              {contactBits.length > 0
                ? contactBits.join(" · ")
                : "No email or phone on file"}
            </p>
          ) : (
            <p className="muted">Contact details are private.</p>
          )}
          <div className="stat-line">
            <div>
              <strong>
                {stats.contribution_count}
                <span className="stat-denom">/{stats.payment_count}</span>
              </strong>
              <span>Contributions count</span>
            </div>
            <div>
              <strong>
                {dues.years_count > 0 ? (
                  <>
                    {formatDuesCount(dues.dues_count)}
                    <span className="stat-denom">/{dues.years_count}</span>
                  </>
                ) : (
                  "—"
                )}
              </strong>
              <span>Dues count</span>
            </div>
            <div>
              <strong>{formatMoney(paidTotal)}</strong>
              <span>Contributions paid (₦)</span>
            </div>
            <div>
              <strong>
                {dues.years_count > 0 ? formatMoney(dues.amount_paid) : "—"}
              </strong>
              <span>Dues paid (₦)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <h2>Contributions</h2>
          {payments.length === 0 ? (
            <div className="hero-empty">
              No contribution payments recorded for this member.
            </div>
          ) : (
            <PaymentGroups groups={groups} showMember={false} isAdmin={admin} />
          )}
        </section>

        <section className="panel">
          <div className="panel-heading-row">
            <h2>Dues</h2>
            {dues.years_count > 0 ? (
              <p className="panel-heading-meta">
                {formatDuesCount(dues.dues_count)}/{dues.years_count} years ·{" "}
                {formatMoney(dues.amount_paid)}
              </p>
            ) : null}
          </div>
          {dues.years_count === 0 ? (
            <div className="hero-empty">No dues years opened yet.</div>
          ) : (
            <div className="stack">
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
                      <th className="num">Credit</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dues.years.map((year) => (
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
                            className={
                              paid ? "dues-month dues-paid" : "dues-month"
                            }
                          >
                            {paid ? "●" : "·"}
                          </td>
                        ))}
                        <td className="num">{year.months_count}/12</td>
                        <td className="num">
                          {formatDuesCount(year.year_fraction)}
                        </td>
                        <td>{formatMoney(year.amount_paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {dues.years.some((y) => y.payments.length > 0) ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Year</th>
                        <th>Amount</th>
                        <th>Months</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dues.years.flatMap((year) =>
                        year.payments.map((p) => (
                          <tr key={p.id}>
                            <td>{formatDate(p.payment_date)}</td>
                            <td>{year.schedule.year}</td>
                            <td>{formatMoney(p.amount)}</td>
                            <td className="muted">
                              {p.covered_months.length} (
                              {formatCoveredMonths(p.covered_months)})
                            </td>
                            <td className="muted">{p.notes || "—"}</td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
