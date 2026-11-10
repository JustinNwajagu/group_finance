import Link from "next/link";
import { connection } from "next/server";
import {
  certifyExpenseAction,
  removeExpense,
  saveBankAccountDetails,
} from "@/app/actions/expenses";
import { FormBusyMarker } from "@/components/action-form";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import {
  FormPendingStatus,
  PendingSubmitButton,
} from "@/components/pending-submit-button";
import { RecordExpenseForm } from "@/components/record-expense-form";
import { requireAccess, isAdmin } from "@/lib/auth";
import {
  getBankLedgerSummary,
  listExpenseViews,
} from "@/lib/expenses-data";
import { formatDate, formatMoney } from "@/lib/format";
import { listMemberOptions } from "@/lib/data";
import { getBankAccountDetails } from "@/lib/store";

export const instant = false;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const viewer = await requireAccess();
  const admin = isAdmin(viewer);
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;

  const [ledger, bank, expenses, members] = await Promise.all([
    getBankLedgerSummary(),
    getBankAccountDetails(),
    listExpenseViews(),
    admin ? listMemberOptions() : Promise.resolve([]),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const pending = expenses.filter((e) => !e.certified);
  const certified = expenses.filter((e) => e.certified);
  const viewerEmail = viewer.email.trim().toLowerCase();

  return (
    <AppShell viewer={viewer} active="expenses">
      <div className="page-head expenses-head">
        <div>
          <h1>Expenses</h1>
          <p>
            Bank balance rises with paid contributions and dues, and falls when
            expenses are certified by two admins. Notes are required on every
            payout.
          </p>
        </div>
        <aside className="bank-corner" aria-label="Bank account details">
          <p className="bank-corner-label">Bank account</p>
          <p className="bank-corner-name">{bank.account_name || "—"}</p>
          <p className="bank-corner-meta">
            {bank.bank_name || "—"}
            {bank.account_number ? ` · ${bank.account_number}` : ""}
          </p>
          {bank.bank_code ? (
            <p className="bank-corner-meta">Code {bank.bank_code}</p>
          ) : null}
        </aside>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          bank: "Bank account details saved.",
          recorded: "Expense recorded. Needs two admin certifications.",
          cert_progress: "Certification recorded. One more admin still needed.",
          certified: "Expense certified and deducted from the bank balance.",
          removed: "Uncertified expense removed.",
        }}
      />

      <section className="panel expenses-balance-panel">
        <div className="stat-line expenses-balance-line">
          <div>
            <strong>{formatMoney(ledger.balance)}</strong>
            <span>Bank balance</span>
          </div>
          <div>
            <strong>{formatMoney(ledger.contributions_in)}</strong>
            <span>Contributions in</span>
          </div>
          <div>
            <strong>{formatMoney(ledger.dues_in)}</strong>
            <span>Dues in</span>
          </div>
          <div>
            <strong>{formatMoney(ledger.expenses_out)}</strong>
            <span>Certified out</span>
          </div>
          <div>
            <strong>{formatMoney(ledger.pending_expenses)}</strong>
            <span>Awaiting certification</span>
          </div>
        </div>
      </section>

      <div className={admin ? "split split-2" : "stack"}>
        <div className="stack">
          <section className="panel">
            <div className="panel-heading-row">
              <h2>Awaiting certification</h2>
              <p className="panel-heading-meta">
                {pending.length} open · needs 2 admins each
              </p>
            </div>
            {pending.length === 0 ? (
              <div className="hero-empty">No expenses waiting for certification.</div>
            ) : (
              <div className="stack expense-list">
                {pending.map((expense) => {
                  const alreadySigned = expense.certifications.some(
                    (c) => c.email === viewerEmail,
                  );
                  return (
                    <article key={expense.id} className="expense-card">
                      <div className="expense-card-head">
                        <div>
                          <p className="expense-card-amount">
                            {formatMoney(expense.amount)}
                          </p>
                          <p className="muted">
                            {formatDate(expense.expense_date)} ·{" "}
                            {expense.kind === "member"
                              ? "Member payout"
                              : "Miscellaneous"}
                          </p>
                        </div>
                        <span className="badge-pledge">
                          {expense.certifications.length}/2 certified
                        </span>
                      </div>
                      <p className="expense-notes">{expense.notes}</p>
                      {expense.allocations.length > 0 ? (
                        <ul className="expense-alloc-list">
                          {expense.allocations.map((a) => (
                            <li key={`${expense.id}-${a.member_id}`}>
                              <Link
                                className="row-link"
                                href={`/members/${a.member_id}`}
                              >
                                {a.member_name}
                              </Link>{" "}
                              received {formatMoney(a.amount)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {expense.certifications.length > 0 ? (
                        <p className="muted expense-certs">
                          Signed by{" "}
                          {expense.certifications
                            .map((c) => c.name || c.email)
                            .join(", ")}
                        </p>
                      ) : (
                        <p className="muted expense-certs">No certifications yet.</p>
                      )}
                      {admin ? (
                        <div className="expense-card-actions">
                          {!alreadySigned ? (
                            <form action={certifyExpenseAction}>
                              <FormBusyMarker />
                              <input
                                type="hidden"
                                name="expense_id"
                                value={expense.id}
                              />
                              <PendingSubmitButton
                                className="btn-primary"
                                idleLabel="Certify"
                                pendingLabel="Certifying…"
                              />
                            </form>
                          ) : (
                            <p className="muted" style={{ margin: 0 }}>
                              Waiting for a second admin.
                            </p>
                          )}
                          <form action={removeExpense}>
                            <FormBusyMarker />
                            <input
                              type="hidden"
                              name="expense_id"
                              value={expense.id}
                            />
                            <PendingSubmitButton
                              className="text-link"
                              idleLabel="Remove"
                              pendingLabel="Removing…"
                            />
                          </form>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading-row">
              <h2>Certified expenses</h2>
              <p className="panel-heading-meta">
                {certified.length} · deducted from balance
              </p>
            </div>
            {certified.length === 0 ? (
              <div className="hero-empty">No certified expenses yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Type</th>
                      <th>Paid to</th>
                      <th>Notes</th>
                      <th>Certified by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certified.map((expense) => (
                      <tr key={expense.id}>
                        <td>{formatDate(expense.expense_date)}</td>
                        <td>{formatMoney(expense.amount)}</td>
                        <td>
                          {expense.kind === "member"
                            ? "Member"
                            : "Miscellaneous"}
                        </td>
                        <td>
                          {expense.allocations.length > 0 ? (
                            <ul className="expense-inline-list">
                              {expense.allocations.map((a) => (
                                <li key={`${expense.id}-${a.member_id}`}>
                                  <Link
                                    className="row-link"
                                    href={`/members/${a.member_id}`}
                                  >
                                    {a.member_name}
                                  </Link>{" "}
                                  · {formatMoney(a.amount)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="muted">{expense.notes}</td>
                        <td className="muted">
                          {expense.certifications
                            .map((c) => c.name || c.email)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {admin ? (
          <div className="stack">
            <section className="panel">
              <h2>Record expense</h2>
              <RecordExpenseForm members={members} today={today} />
            </section>

            <section className="panel">
              <h2>Bank account details</h2>
              <form action={saveBankAccountDetails} className="form-grid">
                <FormBusyMarker />
                <label className="field">
                  Bank
                  <input
                    name="bank_name"
                    required
                    defaultValue={bank.bank_name}
                    autoComplete="organization"
                  />
                </label>
                <label className="field">
                  Account name
                  <input
                    name="account_name"
                    required
                    defaultValue={bank.account_name}
                    autoComplete="name"
                  />
                </label>
                <label className="field">
                  Account number
                  <input
                    name="account_number"
                    required
                    defaultValue={bank.account_number}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  Bank code (optional)
                  <input
                    name="bank_code"
                    defaultValue={bank.bank_code}
                    autoComplete="off"
                  />
                </label>
                <div className="form-actions">
                  <PendingSubmitButton
                    className="btn-primary"
                    idleLabel="Save bank details"
                    pendingLabel="Saving…"
                  />
                  <FormPendingStatus message="Saving bank details…" />
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
