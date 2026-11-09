import Link from "next/link";
import { Suspense } from "react";
import { createMember } from "@/app/actions/members";
import { FormBusyMarker } from "@/components/action-form";
import { AppShell } from "@/components/app-shell";
import { FilterBar } from "@/components/filter-bar";
import { Flash } from "@/components/flash";
import { PageFallback } from "@/components/page-fallback";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireAccess, isAdmin } from "@/lib/auth";
import { listMembers, requestedPaymentCount } from "@/lib/data";
import { listDuesSchedules } from "@/lib/dues-data";
import { formatDuesCount } from "@/lib/dues-months";
import type { MemberContribution } from "@/lib/types";

export const instant = false;

async function HomeRoster({
  membersPromise,
  contributionCountPromise,
  duesYearCountPromise,
  q,
  admin,
}: {
  membersPromise: Promise<MemberContribution[]>;
  contributionCountPromise: Promise<number>;
  duesYearCountPromise: Promise<number>;
  q: string;
  admin: boolean;
}) {
  const [members, contributionCount, duesYearCount] = await Promise.all([
    membersPromise,
    contributionCountPromise,
    duesYearCountPromise,
  ]);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-heading-row">
          <h2>Roster</h2>
          <p className="panel-heading-meta">
            Members <strong>{members.length}</strong>
            {" · "}
            Contributions count <strong>{contributionCount}</strong>
            {" · "}
            Dues count <strong>{duesYearCount}</strong>
          </p>
        </div>
        {members.length === 0 ? (
          <div className="hero-empty">
            {q
              ? "No members match that filter."
              : "No members yet. Admins can add or import the first names."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Member</th>
                  <th className="num">Contributions</th>
                  <th className="num">Dues</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, index) => (
                  <tr key={m.id}>
                    <td className="num muted">{index + 1}</td>
                    <td>
                      <Link className="row-link" href={`/members/${m.id}`}>
                        {m.name}
                      </Link>
                    </td>
                    <td className="num">
                      {m.contribution_count}
                      <span className="muted">/{m.payment_count}</span>
                    </td>
                    <td className="num">
                      {m.dues_years_count > 0 ? (
                        <>
                          {formatDuesCount(m.dues_count)}
                          <span className="muted">/{m.dues_years_count}</span>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {admin ? (
        <section className="panel">
          <h2>Add member</h2>
          <form action={createMember} className="form-grid">
            <FormBusyMarker />
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
  const viewerPromise = requireAccess();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const membersPromise = listMembers(q);
  const contributionCountPromise = requestedPaymentCount();
  const duesYearCountPromise = listDuesSchedules().then((rows) => rows.length);
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
            opened year as 1 — partial months count as a fraction (3 months =
            0.25). The two counts are separate and stored in different tables.
          </p>
        </div>
        <Suspense fallback={null}>
          <FilterBar placeholder="Filter members…" />
        </Suspense>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          member: "Member added.",
        }}
      />

      <Suspense fallback={<PageFallback label="Loading roster…" />}>
        <HomeRoster
          membersPromise={membersPromise}
          contributionCountPromise={contributionCountPromise}
          duesYearCountPromise={duesYearCountPromise}
          q={q}
          admin={admin}
        />
      </Suspense>
    </AppShell>
  );
}
