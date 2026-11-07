import { connection } from "next/server";
import { createPaymentRequest } from "@/app/actions/payments";
import { AppShell } from "@/components/app-shell";
import { ContributionBoard } from "@/components/contribution-board";
import { Flash } from "@/components/flash";
import { requireAccess, isAdmin } from "@/lib/auth";
import {
  listContributionBoards,
  listMemberOptions,
} from "@/lib/data";

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
  const [boards, members] = await Promise.all([
    listContributionBoards(false),
    admin ? listMemberOptions() : Promise.resolve([]),
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
            Each payment request applies to every member, has a deadline, and can
            be concluded by an admin. Amounts are in Nigerian Naira (₦).
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          "1": "Payment request created for all members.",
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
                  Amount per member (₦)
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
                  <input name="deadline" type="date" required defaultValue={today} />
                </label>
                <p className="muted" style={{ margin: 0 }}>
                  Creates a pledge for every member on the roster. Conclude later
                  to finalize who contributed.
                </p>
                <button type="submit" className="btn-primary">
                  Create payment
                </button>
              </form>
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
