import { connection } from "next/server";
import { recordDuesPayment } from "@/app/actions/dues";
import { AmendArchivedDuesForm } from "@/components/amend-archived-dues-form";
import { ArchiveBoards } from "@/components/archive-boards";
import { ArchiveDuesBoards } from "@/components/archive-dues-boards";
import { AppShell } from "@/components/app-shell";
import { DashTools } from "@/components/dash-tools";
import { Flash } from "@/components/flash";
import { requireAccess, isAdmin } from "@/lib/auth";
import {
  listContributionBoards,
  listMemberOptions,
} from "@/lib/data";
import {
  getDuesBoard,
  listConcludedDuesSchedules,
  mapEarliestUnpaidDuesPoints,
} from "@/lib/dues-data";
import { todayIsoDate } from "@/lib/format";

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
  const concludedDuesPromise = listConcludedDuesSchedules();
  const params = await searchParams;
  const viewer = await viewerPromise;
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const bulkCount =
    typeof params.count === "string" ? params.count : undefined;
  const bulkTitle =
    typeof params.title === "string" ? params.title : undefined;
  const admin = isAdmin(viewer);
  const [allBoards, members, concludedDues, earliestUnpaidByMember] =
    await Promise.all([
      boardsPromise,
      admin ? membersPromise : Promise.resolve([]),
      concludedDuesPromise,
      admin ? mapEarliestUnpaidDuesPoints() : Promise.resolve(new Map()),
    ]);
  const boards = allBoards
    .filter((b) => b.request.concluded_at)
    .sort(
      (a, b) =>
        (b.request.concluded_at ?? "").localeCompare(
          a.request.concluded_at ?? "",
        ) ||
        b.request.deadline.localeCompare(a.request.deadline) ||
        b.request.id - a.request.id,
    );

  const duesBoards = (
    await Promise.all(concludedDues.map((s) => getDuesBoard(s.id)))
  ).filter((b): b is NonNullable<typeof b> => b != null);

  const today = todayIsoDate();
  const showAside = admin && concludedDues.length > 0;

  return (
    <AppShell viewer={viewer} active="archive">
      <div className="page-head">
        <div>
          <h1>Archive</h1>
          <p>
            Concluded contributions and dues years. Lists stay visible; admins
            can still amend records or clear a concluded date to reopen.
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          recorded: "Record updated.",
          contributed: "Member marked as contributed.",
          pledged: "Member marked as contributed (pledge).",
          paid: "Status set to paid.",
          status: "Contribution status updated.",
          cleared: "Record cleared.",
          amended: "Contribution list updated.",
          concluded: "Payment archived.",
          concluded_transferred:
            "Payment archived and remaining balance transferred to the bank.",
          reopened: "Payment reopened — see Payments.",
          dues_concluded: "Dues year archived.",
          year_archived: "Dues year opened already archived (deadline passed).",
          bulk_contributions: bulkTitle
            ? `Imported ${bulkCount ?? ""} contribution row(s) for “${bulkTitle}” into Archive (deadline already passed).`
            : "Contribution spreadsheet imported into Archive.",
          bulk_dues: bulkTitle
            ? `Imported ${bulkCount ?? ""} dues row(s) for “${bulkTitle}” into Archive.`
            : "Dues spreadsheet imported into Archive.",
        }}
      />

      <div className={showAside ? "dash-layout" : "stack"}>
        <div className="dash-main stack">
          <section className="panel">
            <h2>Concluded contributions</h2>
            <ArchiveBoards boards={boards} isAdmin={admin} />
          </section>

          <section className="panel">
            <h2>Concluded dues</h2>
            <ArchiveDuesBoards boards={duesBoards} isAdmin={admin} />
          </section>
        </div>

        {showAside ? (
          <DashTools title="Admin tools">
            <section className="panel">
              <h2>Amend archived dues</h2>
              <AmendArchivedDuesForm
                action={recordDuesPayment}
                boards={duesBoards.map((b) => ({
                  schedule: b.schedule,
                  remainingByMember: Object.fromEntries(
                    b.rows.map((row) => [
                      row.member.id,
                      row.remaining_months,
                    ]),
                  ),
                }))}
                members={members}
                today={today}
                earliestUnpaidByMember={Object.fromEntries(
                  earliestUnpaidByMember.entries(),
                )}
              />
            </section>
          </DashTools>
        ) : null}
      </div>
    </AppShell>
  );
}
