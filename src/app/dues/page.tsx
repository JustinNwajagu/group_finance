import Link from "next/link";
import { connection } from "next/server";
import {
  createDuesYear,
  recordDuesPayment,
  removeDuesPayment,
} from "@/app/actions/dues";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { requireAccess, isAdmin } from "@/lib/auth";
import { getDuesBoard, listDuesSchedules } from "@/lib/dues-data";
import {
  DUES_MONTH_LABELS,
  formatCoveredMonths,
  monthsFromAmount,
} from "@/lib/dues-months";
import { formatDate, formatMoney } from "@/lib/format";
import { listMemberOptions } from "@/lib/data";

export const instant = false;

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewer = await requireAccess();
  const admin = isAdmin(viewer);
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const yearParam =
    typeof params.year === "string" ? Number(params.year) : NaN;

  const schedules = await listDuesSchedules();
  const currentYear = new Date().getFullYear();
  const selectedYear = Number.isFinite(yearParam)
    ? yearParam
    : (schedules[0]?.year ?? currentYear);
  const selectedSchedule =
    schedules.find((s) => s.year === selectedYear) ?? schedules[0] ?? null;

  const [board, members] = await Promise.all([
    selectedSchedule
      ? getDuesBoard(selectedSchedule.id)
      : Promise.resolve(null),
    admin ? listMemberOptions() : Promise.resolve([]),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const monthly = board ? Number(board.schedule.monthly_amount) : 0;

  return (
    <AppShell viewer={viewer} active="dues">
      <div className="page-head">
        <div>
          <h1>Dues</h1>
          <p>
            Monthly dues run January–December each year, tracked separately from
            contribution payments. Amount paid ÷ monthly due = months covered;
            members can clear the year in one payment or over time.
          </p>
        </div>
        {schedules.length > 0 ? (
          <div className="dues-year-switch" role="navigation" aria-label="Dues years">
            {schedules.map((s) => (
              <Link
                key={s.id}
                href={`/dues?year=${s.year}`}
                className={
                  selectedSchedule?.id === s.id
                    ? "dues-year-chip active"
                    : "dues-year-chip"
                }
              >
                {s.year}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          year: "Dues year opened.",
          recorded: "Dues payment recorded.",
          cleared: "Dues payment removed.",
        }}
      />

      <div className={admin ? "split split-2" : "stack"}>
        <section className="panel">
          <div className="panel-heading-row">
            <h2>
              {board
                ? `${board.schedule.year} dues`
                : "Year tracker"}
            </h2>
            {board ? (
              <p className="panel-heading-meta">
                Monthly {formatMoney(board.schedule.monthly_amount)} · Collected{" "}
                <strong>{formatMoney(board.total_collected)}</strong>
              </p>
            ) : null}
          </div>

          {!board ? (
            <div className="hero-empty">
              {admin
                ? "Open a dues year to start tracking Jan–Dec payments."
                : "No dues year has been opened yet."}
            </div>
          ) : (
            <div className="table-wrap dues-table-wrap">
              <table className="data dues-grid">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Member</th>
                    {DUES_MONTH_LABELS.map((label) => (
                      <th key={label} className="dues-month">
                        {label}
                      </th>
                    ))}
                    <th className="num">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((row, index) => (
                    <tr key={row.member.id}>
                      <td className="num muted">{index + 1}</td>
                      <td>
                        <Link
                          className="row-link"
                          href={`/members/${row.member.id}`}
                        >
                          {row.member.name}
                        </Link>
                      </td>
                      {row.months_paid.map((paid, i) => (
                        <td
                          key={DUES_MONTH_LABELS[i]}
                          className={
                            paid ? "dues-month dues-paid" : "dues-month"
                          }
                          title={
                            paid
                              ? `${DUES_MONTH_LABELS[i]} paid`
                              : `${DUES_MONTH_LABELS[i]} unpaid`
                          }
                        >
                          {paid ? "●" : "·"}
                        </td>
                      ))}
                      <td className="num">
                        {row.months_count}/12
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {admin ? (
          <div className="stack">
            <section className="panel">
              <h2>Record dues payment</h2>
              {!board || members.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {members.length === 0
                    ? "Add members on Home first."
                    : "Open a dues year first."}
                </p>
              ) : (
                <form action={recordDuesPayment} className="form-grid">
                  <input
                    type="hidden"
                    name="dues_schedule_id"
                    value={board.schedule.id}
                  />
                  <label className="field">
                    Member
                    <select name="member_id" required defaultValue="">
                      <option value="" disabled>
                        Select member
                      </option>
                      {board.rows
                        .filter((r) => r.remaining_months > 0)
                        .map((r) => (
                          <option key={r.member.id} value={r.member.id}>
                            {r.member.name} · {r.months_count}/12 · up to{" "}
                            {formatMoney(
                              r.remaining_months *
                                Number(board.schedule.monthly_amount),
                            )}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    Amount paid (₦)
                    <input
                      name="amount"
                      type="number"
                      min={monthly}
                      step={monthly || 0.01}
                      required
                      placeholder={board.schedule.monthly_amount}
                    />
                  </label>
                  <p className="muted" style={{ margin: 0 }}>
                    Must be a multiple of {formatMoney(board.schedule.monthly_amount)}.
                    Example: {formatMoney(monthly * 3)} covers 3 months from the
                    next unpaid month.
                    {monthsFromAmount(monthly * 12, monthly) === 12
                      ? ` Full year = ${formatMoney(monthly * 12)}.`
                      : null}
                  </p>
                  <label className="field">
                    Payment date
                    <input
                      name="payment_date"
                      type="date"
                      required
                      defaultValue={today}
                    />
                  </label>
                  <label className="field">
                    Notes (optional)
                    <textarea
                      name="notes"
                      rows={2}
                      placeholder="Bank transfer ref, cash collector, etc."
                    />
                  </label>
                  <button type="submit" className="btn-primary">
                    Save dues payment
                  </button>
                </form>
              )}
            </section>

            <section className="panel">
              <h2>Open dues year</h2>
              <form action={createDuesYear} className="form-grid">
                <div className="form-grid two">
                  <label className="field">
                    Year
                    <input
                      name="year"
                      type="number"
                      min={2000}
                      max={2100}
                      required
                      defaultValue={
                        schedules.some((s) => s.year === currentYear)
                          ? currentYear + 1
                          : currentYear
                      }
                    />
                  </label>
                  <label className="field">
                    Monthly due (₦)
                    <input
                      name="monthly_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="0.00"
                    />
                  </label>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  Creates a Jan–Dec tracker for that year. One schedule per year;
                  monthly amount is fixed for everyone.
                </p>
                <button type="submit" className="btn-primary">
                  Open year
                </button>
              </form>
            </section>

            {board && board.payments.length > 0 ? (
              <section className="panel">
                <h2>Recent dues payments</h2>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Member</th>
                        <th>Amount</th>
                        <th>Months</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.payments.slice(0, 40).map((p) => {
                        const monthCount = p.covered_months.length;
                        return (
                          <tr key={p.id}>
                            <td>{formatDate(p.payment_date)}</td>
                            <td>{p.member_name}</td>
                            <td>{formatMoney(p.amount)}</td>
                            <td className="muted">
                              {monthCount} ({formatCoveredMonths(p.covered_months)})
                            </td>
                            <td className="muted">{p.notes || "—"}</td>
                            <td>
                              <form action={removeDuesPayment}>
                                <input type="hidden" name="id" value={p.id} />
                                <button
                                  type="submit"
                                  className="btn-ghost"
                                  style={{
                                    padding: "0.15rem 0.45rem",
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  Remove
                                </button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
