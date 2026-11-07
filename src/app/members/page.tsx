import Link from "next/link";
import { Suspense } from "react";
import { createMember, importMembers } from "@/app/actions/members";
import { AppShell } from "@/components/app-shell";
import { ActionForm } from "@/components/forms";
import { FilterBar } from "@/components/filter-bar";
import { requireAccess, isAdmin } from "@/lib/auth";
import { listMembers } from "@/lib/data";
import { formatMoney } from "@/lib/format";

export const instant = false;

export default async function MembersPage({
  searchParams,
}: PageProps<"/members">) {
  const viewer = await requireAccess();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const members = await listMembers(q);
  const admin = isAdmin(viewer);

  return (
    <AppShell viewer={viewer} active="members">
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <p>Browse the group roster, filter by name, and open contribution totals.</p>
        </div>
        <Suspense fallback={null}>
          <FilterBar placeholder="Filter members…" />
        </Suspense>
      </div>

      <div className={admin ? "split split-2" : "stack"}>
        <section className="panel">
          <h2>Roster</h2>
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
                    <th>Member</th>
                    <th>Email</th>
                    <th>Payments</th>
                    <th>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link className="row-link" href={`/members/${m.id}`}>
                          {m.name}
                        </Link>
                      </td>
                      <td className="muted">{m.email || "—"}</td>
                      <td>{m.payment_count}</td>
                      <td className="money">
                        {formatMoney(m.contribution_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {admin ? (
          <div className="stack">
            <section className="panel">
              <h2>Add member</h2>
              <ActionForm
                action={createMember}
                className="form-grid"
                submitLabel="Add member"
                successMessage="Member added."
              >
                <label className="field">
                  Name
                  <input name="name" required autoComplete="off" />
                </label>
                <label className="field">
                  Email (optional)
                  <input name="email" type="email" autoComplete="off" />
                </label>
              </ActionForm>
            </section>
            <section className="panel">
              <h2>Import members</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                One per line: <code>Name</code> or <code>Name, email</code>.
              </p>
              <ActionForm
                action={importMembers}
                className="form-grid"
                submitLabel="Import"
                pendingLabel="Importing…"
                successMessage="Import complete."
              >
                <label className="field">
                  CSV / list
                  <textarea
                    name="csv"
                    placeholder={"Ada Lovelace, ada@example.com\nGrace Hopper"}
                  />
                </label>
              </ActionForm>
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
