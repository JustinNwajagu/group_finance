import { connection } from "next/server";
import { recordMemberContribution } from "@/app/actions/payments";
import {
  AmendArchivedForm,
  type ExistingContribution,
} from "@/components/amend-archived-form";
import { ArchiveBoards } from "@/components/archive-boards";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { requireAccess, isAdmin } from "@/lib/auth";
import {
  listAllPaymentRequests,
  listContributionBoards,
  listMemberOptions,
} from "@/lib/data";
import { listAllPaymentRows } from "@/lib/store";

export const instant = false;

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewerPromise = requireAccess();
  const boardsPromise = listContributionBoards(false);
  const membersPromise = listMemberOptions();
  const requestsPromise = listAllPaymentRequests();
  const paymentsPromise = listAllPaymentRows();
  const params = await searchParams;
  const viewer = await viewerPromise;
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const bulkCount =
    typeof params.count === "string" ? params.count : undefined;
  const bulkTitle =
    typeof params.title === "string" ? params.title : undefined;
  const admin = isAdmin(viewer);
  const [allBoards, members, allRequests, allPayments] = await Promise.all([
    boardsPromise,
    admin ? membersPromise : Promise.resolve([]),
    admin ? requestsPromise : Promise.resolve([]),
    admin ? paymentsPromise : Promise.resolve([]),
  ]);
  const boards = allBoards.filter((b) => b.request.concluded_at);
  const requests = allRequests.filter((r) => r.concluded_at);
  const archivedRequestIds = new Set(requests.map((r) => r.id));
  const existing: Record<string, ExistingContribution> = {};
  for (const p of allPayments) {
    if (!archivedRequestIds.has(p.payment_request_id)) continue;
    existing[`${p.payment_request_id}:${p.member_id}`] = {
      amount: p.amount,
      status: p.status,
      payment_date: p.payment_date,
      notes: p.notes,
    };
  }
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
          cleared: "Member marked as not yet contributed.",
          amended: "Contribution list updated.",
          concluded: "Payment archived.",
          concluded_transferred:
            "Payment archived and remaining balance transferred to the bank.",
          reopened: "Payment reopened — see Payments.",
          bulk_contributions: bulkTitle
            ? `Imported ${bulkCount ?? ""} contribution row(s) for “${bulkTitle}” into Archive (deadline already passed).`
            : "Contribution spreadsheet imported into Archive.",
        }}
      />

      <div
        className={
          admin && requests.length > 0 ? "dash-layout" : "stack"
        }
      >
        <div className="dash-main">
          <section className="panel">
            <h2>Concluded payments</h2>
            <ArchiveBoards boards={boards} isAdmin={admin} />
          </section>
        </div>

        {admin && requests.length > 0 ? (
          <aside className="dash-aside">
            <section className="panel">
              <h2>Amend archived contribution</h2>
              <AmendArchivedForm
                action={recordMemberContribution}
                requests={requests}
                members={members}
                existing={existing}
                today={today}
              />
            </section>
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
