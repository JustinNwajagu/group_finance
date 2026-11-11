import { Suspense } from "react";
import { connection } from "next/server";
import { bulkImportContributions } from "@/app/actions/bulk-import";
import { createPaymentRequest } from "@/app/actions/payments";
import { FormBusyMarker } from "@/components/action-form";
import { AppShell } from "@/components/app-shell";
import { ContributionBoard } from "@/components/contribution-board";
import { Flash } from "@/components/flash";
import { PageFallback } from "@/components/page-fallback";
import {
  FormPendingStatus,
  PendingSubmitButton,
} from "@/components/pending-submit-button";
import { requireAccess, isAdmin } from "@/lib/auth";
import { listContributionBoards, listMemberOptions } from "@/lib/data";
import type { ContributionLists, Member } from "@/lib/types";

export const instant = false;

async function PaymentsBody({
  admin,
  boardsPromise,
  membersPromise,
}: {
  admin: boolean;
  boardsPromise: Promise<ContributionLists[]>;
  membersPromise: Promise<Member[]>;
}) {
  await connection();
  const [boards, members] = await Promise.all([
    boardsPromise,
    admin ? membersPromise : Promise.resolve([] as Member[]),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
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
            <h2>New payment</h2>
            {members.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Add a member on Home first, then create a payment request.
              </p>
            ) : (
              <form action={createPaymentRequest} className="form-grid">
                <FormBusyMarker />
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
                <PendingSubmitButton
                  idleLabel="Create payment"
                  pendingLabel="Creating…"
                />
              </form>
            )}
          </section>

          <section className="panel">
            <h2>Bulk upload contributions</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Upload CSV or Excel. The <strong>file name</strong> becomes the
              contribution title. Required columns: <code>Member</code>,{" "}
              <code>Amount</code>, <code>Status</code> (paid or pledge).
              Optional: <code>Payment date</code>, <code>Notes</code>. If the
              deadline is already in the past, the contribution is closed and
              goes to <strong>Archive</strong>.
            </p>
            {members.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Add members on Home first.
              </p>
            ) : (
              <form action={bulkImportContributions} className="form-grid">
                <FormBusyMarker />
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
                </div>
                <FormPendingStatus message="Validating spreadsheet and uploading contributions…" />
                <PendingSubmitButton
                  idleLabel="Validate & import"
                  pendingLabel="Validating & uploading…"
                />
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default async function PaymentsPage({
  searchParams,
}: PageProps<"/payments">) {
  await connection();
  // Kick off auth + data in parallel so Firestore isn't gated behind session verify.
  const viewerPromise = requireAccess();
  const boardsPromise = listContributionBoards(true);
  const membersPromise = listMemberOptions();
  const params = await searchParams;
  const viewer = await viewerPromise;
  const admin = isAdmin(viewer);
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const bulkCount =
    typeof params.count === "string" ? params.count : undefined;
  const bulkTitle =
    typeof params.title === "string" ? params.title : undefined;

  return (
    <AppShell viewer={viewer} active="payments">
      <div className="page-head">
        <div>
          <h1>Contributions</h1>
          <p>
            One-off contribution requests (separate from monthly dues). Use
            Pledge / Mark paid on each board to record members.
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          "1": "Payment request created. Use Pledge or Mark paid on the board to record members.",
          recorded: "Member marked as contributed.",
          contributed: "Member marked as contributed.",
          pledged: "Member marked as contributed (pledge).",
          paid: "Status set to paid.",
          status: "Contribution status updated.",
          cleared: "Contribution cleared — member is outstanding again.",
          amended: "Contribution list updated.",
          concluded: "Payment moved to Archive.",
          reopened: "Payment reopened on Payments.",
          bulk_contributions: bulkTitle
            ? `Imported ${bulkCount ?? ""} contribution row(s) for “${bulkTitle}”.`
            : "Contribution spreadsheet imported.",
        }}
      />

      <Suspense fallback={<PageFallback label="Loading contributions…" />}>
        <PaymentsBody
          admin={admin}
          boardsPromise={boardsPromise}
          membersPromise={membersPromise}
        />
      </Suspense>
    </AppShell>
  );
}
