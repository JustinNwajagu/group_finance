import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { deleteMemberAction } from "@/app/actions/members";
import { AppShell } from "@/components/app-shell";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { EditMemberNameForm } from "@/components/edit-member-name-form";
import { Flash } from "@/components/flash";
import { PaymentGroups } from "@/components/payment-groups";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireAccess, isAdmin } from "@/lib/auth";
import { isAdminEmail } from "@/lib/config";
import { splitTitledName } from "@/lib/name-titles";
import {
  getMember,
  listPaymentsForMember,
  memberContribution,
  memberPaymentStats,
} from "@/lib/data";
import { memberDuesSummary } from "@/lib/dues-data";
import { getExcoSeatForMember } from "@/lib/exco";
import { listMemberExpenseReceipts } from "@/lib/expenses-data";
import { countPaymentsForMember } from "@/lib/store";
import {
  DUES_MONTH_LABELS,
  formatCoveredMonths,
  formatDuesCount,
} from "@/lib/dues-months";
import {
  formatDate,
  formatExpenseFunding,
  formatMoney,
} from "@/lib/format";
import { groupPaymentsByTitle } from "@/lib/group";

export const instant = false;

export default async function MemberDetailPage({
  params,
  searchParams,
}: PageProps<"/members/[id]">) {
  await connection();
  const viewer = await requireAccess();
  const admin = isAdmin(viewer);
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id)) notFound();
  const paramsQuery = await searchParams;
  const error =
    typeof paramsQuery.error === "string" ? paramsQuery.error : undefined;
  const ok =
    typeof paramsQuery.ok === "string" ? paramsQuery.ok : undefined;

  const member = await getMember(id);
  if (!member) notFound();

  const [payments, paidTotal, stats, dues, expenseReceipts, exco, paymentCounts] =
    await Promise.all([
      listPaymentsForMember(id),
      memberContribution(id),
      memberPaymentStats(id),
      memberDuesSummary(id),
      listMemberExpenseReceipts(id),
      getExcoSeatForMember(id),
      countPaymentsForMember(id),
    ]);
  const isPrimaryAdminMember =
    isAdminEmail(member.login_email || "") ||
    isAdminEmail(member.email || "");
  const canEditName = admin && !isPrimaryAdminMember;
  const splitName = splitTitledName(member.name);
  const canDeleteMember =
    admin &&
    paymentCounts.total === 0 &&
    !exco &&
    expenseReceipts.length === 0;
  const expensesReceived = expenseReceipts
    .filter((row) => row.expense.certified)
    .reduce((sum, row) => sum + Number(row.amount), 0)
    .toFixed(2);
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
          <h1>
            {member.name}
            {exco ? (
              <span
                className={
                  exco.grants_admin ? "badge badge-admin" : "badge badge-exco"
                }
                style={{ marginLeft: "0.55rem", verticalAlign: "middle" }}
              >
                {exco.label}
              </span>
            ) : null}
          </h1>
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
            <div>
              <strong>
                {expenseReceipts.length > 0
                  ? formatMoney(expensesReceived)
                  : "—"}
              </strong>
              <span>Expenses received (₦)</span>
            </div>
          </div>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          member_updated: "Member name updated.",
        }}
      />

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
                              paid
                                ? "dues-month dues-paid dues-month-tip"
                                : "dues-month dues-month-tip"
                            }
                            data-tip={
                              paid
                                ? `${DUES_MONTH_LABELS[i]} · Paid`
                                : `${DUES_MONTH_LABELS[i]} · Unpaid`
                            }
                          >
                            <span className="dues-month-mark" aria-hidden="true">
                              {paid ? "●" : "·"}
                            </span>
                            <span className="sr-only">
                              {paid
                                ? `${DUES_MONTH_LABELS[i]} paid`
                                : `${DUES_MONTH_LABELS[i]} unpaid`}
                            </span>
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

        <section className="panel">
          <div className="panel-heading-row">
            <h2>Expenses received</h2>
            {expenseReceipts.length > 0 ? (
              <p className="panel-heading-meta">
                Certified {formatMoney(expensesReceived)}
              </p>
            ) : null}
          </div>
          {expenseReceipts.length === 0 ? (
            <div className="hero-empty">
              No expense payouts recorded for this member.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount received</th>
                    <th>Funded from</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseReceipts.map(({ expense, amount }) => (
                    <tr key={`${expense.id}-${amount}`}>
                      <td>
                        <Link className="row-link" href="/expenses">
                          {formatDate(expense.expense_date)}
                        </Link>
                      </td>
                      <td>{formatMoney(amount)}</td>
                      <td className="muted">
                        {formatExpenseFunding({
                          funding_source: expense.funding_source,
                          contribution_title: expense.contribution_title,
                          contribution_amount: expense.contribution_amount,
                          bank_amount: expense.bank_amount,
                        })}
                      </td>
                      <td>
                        {expense.certified ? (
                          <span className="badge-paid">Certified</span>
                        ) : (
                          <span className="badge-pledge">
                            {expense.certifications.length}/2
                          </span>
                        )}
                      </td>
                      <td className="muted">{expense.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {admin ? (
          <section className="panel">
            <h2>Edit name</h2>
            {canEditName ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Update this member’s title and name on the roster. Titles are
                  stored with a trailing dot (for example Engr.).
                </p>
                <EditMemberNameForm
                  memberId={member.id}
                  title={splitName.title}
                  name={splitName.name}
                />
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                The primary admin member cannot be renamed here.
              </p>
            )}
          </section>
        ) : null}

        {admin ? (
          <section className="panel">
            <h2>Remove member</h2>
            {paymentCounts.total > 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {member.name} has {paymentCounts.contributions} contribution
                payment{paymentCounts.contributions === 1 ? "" : "s"}
                {paymentCounts.dues > 0
                  ? ` and ${paymentCounts.dues} dues payment${paymentCounts.dues === 1 ? "" : "s"}`
                  : ""}
                , so they cannot be deleted from the roster.
              </p>
            ) : expenseReceipts.length > 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {member.name} is named on an expense payout, so they cannot be
                deleted from the roster.
              </p>
            ) : exco ? (
              <p className="muted" style={{ margin: 0 }}>
                {member.name} holds the {exco.label} office. Reassign that EXCO
                seat on Access before deleting this member.
              </p>
            ) : canDeleteMember ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Permanently remove this roster member. Only allowed when they
                  have no contribution or dues payments.
                </p>
                <ConfirmActionForm
                  action={deleteMemberAction}
                  message={`Permanently delete ${member.name} from the roster? This cannot be undone.`}
                >
                  <input type="hidden" name="member_id" value={member.id} />
                  <PendingSubmitButton
                    className="btn-ghost"
                    idleLabel="Delete member"
                    pendingLabel="Deleting…"
                  />
                </ConfirmActionForm>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
