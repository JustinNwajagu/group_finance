import { connection } from "next/server";
import {
  createPaymentRequest,
  recordMemberContribution,
} from "@/app/actions/payments";
import { AppShell } from "@/components/app-shell";
import { ContributionBoard } from "@/components/contribution-board";
import { Flash } from "@/components/flash";
import { requireAccess, isAdmin } from "@/lib/auth";
import {
  listContributionBoards,
  listMemberOptions,
  listOpenPaymentRequests,
} from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const instant = false;

export default async function PaymentsPage({
  searchParams,
}: PageProps<"/payments">) {
  await connection();
  const viewer = await requireAccess();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const admin = isAdmin(viewer);
  const [boards, members, requests] = await Promise.all([
    listContributionBoards(true),
    admin ? listMemberOptions() : Promise.resolve([]),
    admin ? listOpenPaymentRequests() : Promise.resolve([]),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell viewer={viewer} active="payments">
      <div className="page-head">
        <div>
          <h1>Contributions</h1>
          <p>
            One-off contribution requests (separate from monthly dues). Record
            pledges and paid amounts here. Finished titles move to Archive.
            Amounts are in Nigerian Naira (₦).
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          "1": "Payment request created. Record each member's contribution next.",
          recorded: "Member marked as contributed.",
          contributed: "Member marked as contributed.",
          pledged: "Member marked as contributed (pledge).",
          paid: "Status set to paid.",
          status: "Contribution status updated.",
          cleared: "Contribution cleared — member is outstanding again.",
          amended: "Contribution list updated.",
          concluded: "Payment moved to Archive.",
          reopened: "Payment reopened on Payments.",
        }}
      />

      <div className={admin ? "split split-2" : "stack"}>
        <section className="panel">
          <h2>Current contributions</h2>
          {boards.length === 0 ? (
            <div className="hero-empty">No open contribution requests.</div>
          ) : (
            <div className="contrib-boards">
              {boards.map((board) => (
                <ContributionBoard
                  key={board.request.id}
                  board={board}
                  isAdmin={admin}
                  returnTo="/payments"
                />
              ))}
            </div>
          )}
        </section>

        {admin ? (
          <div className="stack">
            <section className="panel">
              <h2>Record member contribution</h2>
              {members.length === 0 || requests.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {members.length === 0
                    ? "Add a member on Home first."
                    : "Create a payment request first, then record contributions."}
                </p>
              ) : (
                <form action={recordMemberContribution} className="form-grid">
                  <input type="hidden" name="return_to" value="/payments" />
                  <label className="field">
                    Payment title
                    <select name="payment_request_id" required defaultValue="">
                      <option value="" disabled>
                        Select payment
                      </option>
                      {requests.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} · min {formatMoney(r.amount)} · due{" "}
                          {formatDate(r.deadline)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Member
                    <select name="member_id" required defaultValue="">
                      <option value="" disabled>
                        Select member
                      </option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid two">
                    <label className="field">
                      Amount (₦)
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="0.00"
                      />
                    </label>
                    <label className="field">
                      Status
                      <select name="status" defaultValue="pledge">
                        <option value="pledge">Pledge</option>
                        <option value="paid">Paid</option>
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    Payment date (optional)
                    <input
                      name="payment_date"
                      type="date"
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
                  <p className="muted" style={{ margin: 0 }}>
                    Both pledge and paid count as contributed. Use Archive to
                    amend concluded payments.
                  </p>
                  <button type="submit" className="btn-primary">
                    Save contribution
                  </button>
                </form>
              )}
            </section>

            <section className="panel">
              <h2>New payment</h2>
              {members.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  Add a member on Home first, then create a payment request.
                </p>
              ) : (
                <form action={createPaymentRequest} className="form-grid">
                  <label className="field">
                    Title
                    <input name="title" required autoComplete="off" />
                  </label>
                  <label className="field">
                    Minimum amount per member (₦)
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="0.00"
                    />
                  </label>
                  <label className="field">
                    Payment deadline
                    <input
                      name="deadline"
                      type="date"
                      required
                      defaultValue={today}
                    />
                  </label>
                  <p className="muted" style={{ margin: 0 }}>
                    Creates the payment title. Members stay outstanding until
                    you record a pledge or paid contribution.
                  </p>
                  <button type="submit" className="btn-primary">
                    Create payment
                  </button>
                </form>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
