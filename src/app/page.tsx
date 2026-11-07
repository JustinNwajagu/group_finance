import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { createMember, importMembers } from "@/app/actions/members";
import { AppShell } from "@/components/app-shell";
import { FilterBar } from "@/components/filter-bar";
import { Flash } from "@/components/flash";
import { requireAccess, isAdmin } from "@/lib/auth";
import { listMembers, requestedPaymentCount } from "@/lib/data";

export const instant = false;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewer = await requireAccess();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const admin = isAdmin(viewer);
  const [members, paymentTotal] = await Promise.all([
    listMembers(q),
    requestedPaymentCount(),
  ]);

  return (
    <AppShell viewer={viewer} active="home">
      <div className="page-head">
        <div>
          <h1>Home</h1>
          <p>
            Roster overview. Payments is the count of requested titles (same for
            everyone). Contributions is how many titles each member has a pledge
            or paid record for. Open payments live under Payments; finished ones
            under Archive.
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
          import: "Import complete.",
        }}
      />

      <div className="stack">
        <section className="panel">
          <div className="panel-heading-row">
            <h2>Roster</h2>
            <p className="panel-heading-meta">
              Total payments <strong>{paymentTotal}</strong>
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
                    <th>Member</th>
                    <th>Email</th>
                    <th>Payments</th>
                    <th>Contributions</th>
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
                      <td>{m.contribution_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {admin ? (
          <div className="split split-2">
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
                <button type="submit" className="btn-primary">
                  Add member
                </button>
              </form>
            </section>
            <section className="panel">
              <h2>Import members</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                One per line: <code>Name</code> or <code>Name, email</code>.
              </p>
              <form action={importMembers} className="form-grid">
                <label className="field">
                  CSV / list
                  <textarea
                    name="csv"
                    placeholder={"Ada Lovelace, ada@example.com\nGrace Hopper"}
                  />
                </label>
                <button type="submit" className="btn-primary">
                  Import
                </button>
              </form>
            </section>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
