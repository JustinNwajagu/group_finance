import Link from "next/link";
import { connection } from "next/server";
import { bulkImportDues } from "@/app/actions/bulk-import";
import {
  concludeDuesYear,
  createDuesYear,
  deleteDuesYear,
  recordDuesPayment,
  removeDuesPayment,
} from "@/app/actions/dues";
import { AppShell } from "@/components/app-shell";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { DuesBoardPanel } from "@/components/dues-board-panel";
import { Flash } from "@/components/flash";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { RecordDuesForm } from "@/components/record-dues-form";
import { requireAccess, isAdmin } from "@/lib/auth";
import { getDuesBoard, listOpenDuesSchedules } from "@/lib/dues-data";
import { formatCoveredMonths } from "@/lib/dues-months";
import { formatDate, formatMoney, todayIsoDate } from "@/lib/format";
import { listMemberOptions } from "@/lib/data";

export const instant = false;

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewerPromise = requireAccess();
  const schedulesPromise = listOpenDuesSchedules();
  const params = await searchParams;
  const viewer = await viewerPromise;
  const admin = isAdmin(viewer);
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const bulkCount =
    typeof params.count === "string" ? params.count : undefined;
  const bulkTitle =
    typeof params.title === "string" ? params.title : undefined;
  const bulkYear =
    typeof params.year === "string" ? params.year : undefined;
  const yearParam =
    typeof params.year === "string" ? Number(params.year) : NaN;

  const schedules = await schedulesPromise;
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

  const today = todayIsoDate();
  const monthly = board ? Number(board.schedule.monthly_amount) : 0;

  const yearQuery = (year: number) => `/dues?year=${year}`;

  return (
    <AppShell viewer={viewer} active="dues">
      <div className="page-head">
        <div>
          <h1>Dues</h1>
          <p>
            Monthly dues run September–August each year (year label = the Sept
            start). Amount paid ÷ monthly due = months covered. Payments that
            cover more than one year are split across a year range you choose.
            Concluded years move to Archive.
          </p>
        </div>
        <div className="page-head-tools">
          {schedules.length > 0 ? (
            <div
              className="dues-year-switch"
              role="navigation"
              aria-label="Dues years"
            >
              {schedules.map((s) => (
                <Link
                  key={s.id}
                  href={yearQuery(s.year)}
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
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          year: "Dues year opened.",
          recorded: "Dues payment recorded.",
          cleared: "Dues payment removed.",
          year_deleted: "Dues year removed.",
          dues_concluded: "Dues year archived.",
          bulk_dues: bulkTitle
            ? `Imported ${bulkCount ?? ""} dues row(s) for “${bulkTitle}”${
                bulkYear ? ` (${bulkYear})` : ""
              }.`
            : "Dues spreadsheet imported.",
        }}
      />

      <div className={admin ? "dash-layout" : "stack"}>
        <div className="dash-main">
          {!board && !admin ? (
            <section className="panel">
              <div className="hero-empty">No open dues year right now.</div>
            </section>
          ) : (
            <DuesBoardPanel board={board} />
          )}
        </div>

        {admin ? (
          <aside className="dash-aside stack">
            <section className="panel">
              <h2>Record dues payment</h2>
              {!board || members.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {members.length === 0
                    ? "Add members on Home first."
                    : "Open a dues year first."}
                </p>
              ) : (
                <RecordDuesForm
                  action={recordDuesPayment}
                  scheduleId={board.schedule.id}
                  currentYear={board.schedule.year}
                  monthly={monthly}
                  today={today}
                  yearOptions={schedules.map((s) => s.year)}
                  members={members.map((m) => {
                    const row = board.rows.find((r) => r.member.id === m.id);
                    return {
                      id: m.id,
                      name: m.name,
                      remainingInCurrentYear: row?.remaining_months ?? 12,
                    };
                  })}
                />
              )}
            </section>

            {board ? (
              <section className="panel">
                <h2>Conclude dues year</h2>
                <p className="muted" style={{ marginTop: 0 }}>
                  Moves {board.schedule.year} into Archive. Admins can still
                  amend payments there, or clear the concluded date to reopen.
                </p>
                <form action={concludeDuesYear} className="form-grid">
                  <input type="hidden" name="id" value={board.schedule.id} />
                  <input type="hidden" name="return_to" value="/archive" />
                  <label className="field">
                    Conclude date
                    <input
                      name="concluded_date"
                      type="date"
                      defaultValue={today}
                      required
                    />
                  </label>
                  <PendingSubmitButton
                    idleLabel={`Conclude ${board.schedule.year} dues`}
                    pendingLabel="Concluding…"
                  />
                </form>
              </section>
            ) : null}

            {board ? (
              <section className="panel">
                <h2>Remove dues year</h2>
                {board.payments.length > 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    {board.schedule.year} has {board.payments.length} payment
                    {board.payments.length === 1 ? "" : "s"} recorded. Clear
                    those payments before this year can be removed.
                  </p>
                ) : (
                  <>
                    <p className="muted" style={{ marginTop: 0 }}>
                      Permanently delete {board.schedule.year} dues. Only empty
                      years with no payments can be removed.
                    </p>
                    <ConfirmActionForm
                      action={deleteDuesYear}
                      message={`Permanently delete ${board.schedule.year} dues? This cannot be undone.`}
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={board.schedule.id}
                      />
                      <PendingSubmitButton
                        className="btn-ghost"
                        idleLabel={`Remove ${board.schedule.year} dues`}
                        pendingLabel="Removing…"
                      />
                    </ConfirmActionForm>
                  </>
                )}
              </section>
            ) : null}

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
                <label className="field">
                  Payment deadline
                  <input
                    name="deadline"
                    type="date"
                    required
                    defaultValue={`${
                      (schedules.some((s) => s.year === currentYear)
                        ? currentYear + 1
                        : currentYear) + 1
                    }-09-30`}
                  />
                </label>
                <p className="muted" style={{ margin: 0 }}>
                  Creates a Sept–Aug tracker for that year (deadline usually 30
                  Sep of the following calendar year). One schedule per year;
                  monthly amount is fixed for everyone. A past deadline opens
                  the year already archived. Years that are already open or in
                  Archive cannot be opened again.
                </p>
                <PendingSubmitButton
                  idleLabel="Open year"
                  pendingLabel="Opening…"
                />
              </form>
            </section>

            <section className="panel">
              <h2>Bulk upload dues</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Upload CSV or Excel. The <strong>file name</strong> becomes the
                dues title (include the year, e.g.{" "}
                <code>2026-Dues.xlsx</code>). Required columns:{" "}
                <code>Member</code>, <code>Amount</code>. Optional:{" "}
                <code>Payment date</code>, <code>Notes</code>. Amounts must be
                whole multiples of the monthly due. Nothing is saved if any row
                fails validation.
              </p>
              <form action={bulkImportDues} className="form-grid">
                <label className="field">
                  Spreadsheet
                  <input
                    name="file"
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    required
                  />
                </label>
                <div className="form-grid two">
                  <label className="field">
                    Year (if not in file name)
                    <input
                      name="year"
                      type="number"
                      min={2000}
                      max={2100}
                      defaultValue={selectedYear}
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
                      defaultValue={
                        board ? board.schedule.monthly_amount : undefined
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  Payment deadline
                  <input
                    name="deadline"
                    type="date"
                    required
                    defaultValue={
                      board?.schedule.deadline ?? `${selectedYear + 1}-09-30`
                    }
                  />
                </label>
                <PendingSubmitButton
                  idleLabel="Validate & import"
                  pendingLabel="Validating & uploading…"
                />
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
                              {monthCount} (
                              {formatCoveredMonths(p.covered_months)})
                            </td>
                            <td className="muted">{p.notes || "—"}</td>
                            <td>
                              <form action={removeDuesPayment}>
                                <input type="hidden" name="id" value={p.id} />
                                <PendingSubmitButton
                                  className="btn-ghost"
                                  style={{
                                    padding: "0.15rem 0.45rem",
                                    fontSize: "0.8rem",
                                  }}
                                  idleLabel="Remove"
                                  pendingLabel="Removing…"
                                />
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
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
