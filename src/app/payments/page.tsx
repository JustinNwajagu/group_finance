import { connection } from "next/server";
import { Suspense } from "react";
import { createPayment } from "@/app/actions/payments";
import { AppShell } from "@/components/app-shell";
import { FilterBar } from "@/components/filter-bar";
import { Flash } from "@/components/flash";
import { PaymentGroups } from "@/components/payment-groups";
import { requireAccess, isAdmin } from "@/lib/auth";
import { listMemberOptions, listPayments } from "@/lib/data";
import { groupPaymentsByTitle } from "@/lib/group";

export const instant = false;

export default async function PaymentsPage({
  searchParams,
}: PageProps<"/payments">) {
  await connection();
  const viewer = await requireAccess();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const admin = isAdmin(viewer);
  const [payments, members] = await Promise.all([
    listPayments(q),
    admin ? listMemberOptions() : Promise.resolve([]),
  ]);
  const groups = groupPaymentsByTitle(payments);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell viewer={viewer} active="payments">
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p>
            Amounts are in Nigerian Naira (₦). Grouped by title for everyone.
            New entries start as pledges until an admin marks them paid.
          </p>
        </div>
        <Suspense fallback={null}>
          <FilterBar placeholder="Filter by title or member…" />
        </Suspense>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          "1": "Payment recorded.",
          paid: "Marked as paid.",
        }}
      />

      <div className={admin ? "split split-2" : "stack"}>
        <section className="panel">
          <h2>Payments by title</h2>
          {payments.length === 0 ? (
            <div className="hero-empty">
              {q ? "No payments match that filter." : "No payments recorded yet."}
            </div>
          ) : (
            <PaymentGroups groups={groups} showMember isAdmin={admin} />
          )}
        </section>

        {admin ? (
          <section className="panel">
            <h2>New payment</h2>
            {members.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Add a member first, then record a payment.
              </p>
            ) : (
              <form action={createPayment} className="form-grid">
                <label className="field">
                  Title
                  <input name="title" required autoComplete="off" />
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
                    Date
                    <input
                      name="payment_date"
                      type="date"
                      required
                      defaultValue={today}
                    />
                  </label>
                </div>
                <label className="field">
                  Status
                  <select name="status" defaultValue="pledge">
                    <option value="pledge">Pledge</option>
                    <option value="paid">Paid</option>
                  </select>
                </label>
                <button type="submit" className="btn-primary">
                  Record payment
                </button>
              </form>
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
