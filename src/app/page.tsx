import { Suspense } from "react";
import { connection } from "next/server";
import { createMember } from "@/app/actions/members";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { HomeRosterList } from "@/components/home-roster";
import { PageFallback } from "@/components/page-fallback";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireAccess, isAdmin } from "@/lib/auth";
import { listMembers, requestedPaymentCount } from "@/lib/data";
import { listDuesSchedules } from "@/lib/dues-data";
import { excoByMemberIdMap, listExcoSeatViews } from "@/lib/exco";
import type { ExcoSeatView, MemberContribution } from "@/lib/types";

export const instant = false;

async function HomeBody({
  membersPromise,
  contributionCountPromise,
  duesYearCountPromise,
  excoPromise,
  excoByMemberPromise,
  admin,
}: {
  membersPromise: Promise<MemberContribution[]>;
  contributionCountPromise: Promise<number>;
  duesYearCountPromise: Promise<number>;
  excoPromise: Promise<ExcoSeatView[]>;
  excoByMemberPromise: Promise<Map<number, ExcoSeatView>>;
  admin: boolean;
}) {
  await connection();
  const [members, contributionCount, duesYearCount, excoSeats, excoByMember] =
    await Promise.all([
      membersPromise,
      contributionCountPromise,
      duesYearCountPromise,
      excoPromise,
      excoByMemberPromise,
    ]);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-heading-row">
          <h2>EXCO</h2>
        </div>
        <div className="exco-grid">
          {excoSeats.map((seat) => (
            <div key={seat.office} className="exco-seat">
              <span className="exco-seat-office">{seat.label}</span>
              <span className="exco-seat-name">{seat.display_name}</span>
              {seat.grants_admin ? (
                <span className="badge badge-admin">admin</span>
              ) : (
                <span className="badge badge-exco">exco</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <HomeRosterList
        members={members}
        contributionCount={contributionCount}
        duesYearCount={duesYearCount}
        excoByMemberEntries={Array.from(excoByMember.entries())}
      />

      {admin ? (
        <section className="panel">
          <h2>Add member</h2>
          <form action={createMember} className="form-grid">
            <label className="field">
              Name
              <input name="name" required autoComplete="off" />
            </label>
            <label className="field">
              Email (optional)
              <input name="email" type="email" autoComplete="off" />
            </label>
            <label className="field">
              Phone (optional)
              <input name="phone" type="tel" autoComplete="off" />
            </label>
            <p className="muted" style={{ margin: 0 }}>
              Roster is preloaded. Use this only for rare additions. Adding a
              member does not create a login — approve logins on Access.
            </p>
            <PendingSubmitButton
              idleLabel="Add member"
              pendingLabel="Adding…"
            />
          </form>
        </section>
      ) : null}
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewerPromise = requireAccess();
  const params = await searchParams;
  // Always load the full roster; filtering is client-side so clear is instant.
  const membersPromise = listMembers();
  const contributionCountPromise = requestedPaymentCount();
  const duesYearCountPromise = listDuesSchedules().then((rows) => rows.length);
  const excoPromise = listExcoSeatViews();
  const excoByMemberPromise = excoByMemberIdMap();
  const viewer = await viewerPromise;
  const admin = isAdmin(viewer);
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;

  return (
    <AppShell viewer={viewer} active="home">
      <div className="page-head">
        <div>
          <h1>Home</h1>
          <p>
            Roster overview. <strong>Contributions</strong> is paid contribution
            titles (pledges do not count). <strong>Dues</strong> treats each
            opened year as 1.
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          member: "Member added.",
          member_deleted: "Member removed from the roster.",
        }}
      />

      <Suspense fallback={<PageFallback label="Loading roster…" />}>
        <HomeBody
          membersPromise={membersPromise}
          contributionCountPromise={contributionCountPromise}
          duesYearCountPromise={duesYearCountPromise}
          excoPromise={excoPromise}
          excoByMemberPromise={excoByMemberPromise}
          admin={admin}
        />
      </Suspense>
    </AppShell>
  );
}
