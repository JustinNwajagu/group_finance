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
  listAllPaymentRequests,
  listContributionBoards,
  listMemberOptions,
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
    listContributionBoards(false),
    admin ? listMemberOptions() : Promise.resolve([]),
    admin ? listAllPaymentRequests() : Promise.resolve([]),
  ]);
  const current = boards.filter((b) => !b.request.concluded_at);
  const concluded = boards.filter((b) => b.request.concluded_at);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell viewer={viewer} active="payments">
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p>
            Create payment requests for the whole roster, then record each
            member&apos;s contribution (including on concluded payments).
            Amounts are in Nigerian Naira (₦).
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          "1": "Payment request created for all members.",
          recorded: "Member marked as contributed.",
          contributed: "Member marked as contributed.",
          pledged: "Pledge amount saved (not yet contributed).",
          paid: "Marked as contributed.",
          amended: "Contribution list updated.",
          concluded: "Payment concluded.",
          reopened: "Concluded date cleared.",
        }}
      />

      <div className={admin ? "split split-2" : "stack"}>
        <div className="stack">
          <section className="panel">
            <h2>Current contributions</h2>
            {current.length === 0 ? (
              <div className="hero-empty">No open payment requests.</div>
            ) : (
              current.map((board) => (
                <ContributionBoard
                  key={board.request.id}
                  board={board}
                  isAdmin={admin}
                  returnTo="/payments"
                />
              ))
            )}
          </section>

          <section className="panel">
            <h2>Concluded payments</h2>
            {concluded.length === 0 ? (
              <div className="hero-empty">No concluded payments yet.</div>
            ) : (
              concluded.map((board) => (
                <ContributionBoard
                  key={board.request.id}
                  board={board}
                  isAdmin={admin}
                  returnTo="/payments"
                />
              ))
            )}
          </section>
        </div>

        {admin ? (
          <div className="stack">
            <section className="panel">
              <h2>Record member contribution</h2>
              {members.length === 0 || requests.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {members.length === 0
                    ? "Add a member first."
                    : "Create a payment request first, then record contributions."}
                </p>
              ) : (
                <form action={recordMemberContribution} className="form-grid">
                  <label className="field">
                    Payment title
                    <select name="payment_request_id" required defaultValue="">
                      <option value="" disabled>
                        Select payment
                      </option>
                      {requests.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                          {r.concluded_at ? " (concluded)" : " (current)"} · min{" "}
                          {formatMoney(r.amount)} · due{" "}
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
                      <select name="status" defaultValue="paid">
                        <option value="paid">Paid</option>
                        <option value="pledge">Pledge</option>
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    Payment date (optional)
                    <input name="payment_date" type="date" defaultValue={today} />
                  </label>
                  <p className="muted" style={{ margin: 0 }}>
                    Works for current and concluded payments. Status{" "}
                    <strong>Paid</strong> moves the member into Contributed for
                    that title; Pledge only updates the amount.
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
                  Add a member first, then create a payment request.
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
                    Creates a pledge at the minimum amount for every member.
                    Use Record member contribution to set actual amounts or mark
                    paid.
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
