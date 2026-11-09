import { recordMemberContribution } from "@/app/actions/payments";
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

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewerPromise = requireAccess();
  const boardsPromise = listContributionBoards(false);
  const membersPromise = listMemberOptions();
  const requestsPromise = listAllPaymentRequests();
  const params = await searchParams;
  const viewer = await viewerPromise;
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const bulkCount =
    typeof params.count === "string" ? params.count : undefined;
  const bulkTitle =
    typeof params.title === "string" ? params.title : undefined;
  const admin = isAdmin(viewer);
  const [allBoards, members, allRequests] = await Promise.all([
    boardsPromise,
    admin ? membersPromise : Promise.resolve([]),
    admin ? requestsPromise : Promise.resolve([]),
  ]);
  const boards = allBoards.filter((b) => b.request.concluded_at);
  const requests = allRequests.filter((r) => r.concluded_at);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell viewer={viewer} active="archive">
      <div className="page-head">
        <div>
          <h1>Archive</h1>
          <p>
            Concluded and archived payment requests. Lists stay visible; admins
            can still amend contributions or clear the concluded date to reopen
            a payment.
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          recorded: "Member marked as contributed.",
          contributed: "Member marked as contributed.",
          pledged: "Member marked as contributed (pledge).",
          paid: "Status set to paid.",
          status: "Contribution status updated.",
          cleared: "Contribution cleared — member is outstanding again.",
          amended: "Contribution list updated.",
          concluded: "Payment archived.",
          reopened: "Payment reopened — see Payments.",
          bulk_contributions: bulkTitle
            ? `Imported ${bulkCount ?? ""} contribution row(s) for “${bulkTitle}” into Archive (deadline already passed).`
            : "Contribution spreadsheet imported into Archive.",
        }}
      />

      <div className={admin && requests.length > 0 ? "split split-2" : "stack"}>
        <section className="panel">
          <h2>Concluded payments</h2>
          {boards.length === 0 ? (
            <div className="hero-empty">No archived payments yet.</div>
          ) : (
            <div className="contrib-boards">
              {boards.map((board) => (
                <ContributionBoard
                  key={board.request.id}
                  board={board}
                  isAdmin={admin}
                  returnTo="/archive"
                />
              ))}
            </div>
          )}
        </section>

        {admin && requests.length > 0 ? (
          <section className="panel">
            <h2>Amend archived contribution</h2>
            <form action={recordMemberContribution} className="form-grid">
              <input type="hidden" name="return_to" value="/archive" />
              <label className="field">
                Payment title
                <select name="payment_request_id" required defaultValue="">
                  <option value="" disabled>
                    Select archived payment
                  </option>
                  {requests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} · min {formatMoney(r.amount)} · concluded{" "}
                      {r.concluded_at
                        ? formatDate(r.concluded_at.slice(0, 10))
                        : "—"}
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
                <input name="payment_date" type="date" defaultValue={today} />
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
                Save contribution
              </button>
            </form>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
