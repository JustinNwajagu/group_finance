import { connection } from "next/server";
import { signOut } from "@/app/actions/auth";
import {
  approveAccessRequest,
  rejectAccessRequest,
} from "@/app/actions/access-requests";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { requireAdmin, adminEmail } from "@/lib/auth";
import { listAccessRequests } from "@/lib/access-requests";
import { formatTimestamp } from "@/lib/format";

export const instant = false;

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewer = await requireAdmin();
  const params = await searchParams;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const link = typeof params.link === "string" ? params.link : undefined;
  const [pending, recent] = await Promise.all([
    listAccessRequests("pending"),
    listAccessRequests(),
  ]);
  const decided = recent.filter((r) => r.status !== "pending").slice(0, 20);

  return (
    <AppShell viewer={viewer} active="access">
      <div className="page-head">
        <div>
          <h1>Access</h1>
          <p>Approve new account requests and review this admin session.</p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={undefined}
        messages={{
          approved: "Request approved. Share the password link with the member.",
          rejected: "Request rejected.",
        }}
      />

      {link ? (
        <section className="panel">
          <h2>Password setup link</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Send this one-time link to the new member so they can set a password:
          </p>
          <p style={{ wordBreak: "break-all" }}>
            <a href={link}>{link}</a>
          </p>
        </section>
      ) : null}

      <div className="stack">
        <section className="panel">
          <h2>Pending requests</h2>
          {pending.length === 0 ? (
            <div className="hero-empty">No pending access requests.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Requested</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.email}</td>
                      <td>{r.phone}</td>
                      <td>{formatTimestamp(r.created_at)}</td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.35rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <form action={approveAccessRequest}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="btn-primary">
                              Approve
                            </button>
                          </form>
                          <form action={rejectAccessRequest}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="btn-ghost">
                              Reject
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Recent decisions</h2>
          {decided.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No approvals or rejections yet.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Decided</th>
                  </tr>
                </thead>
                <tbody>
                  {decided.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.email}</td>
                      <td>{r.status}</td>
                      <td>
                        {r.decided_at ? formatTimestamp(r.decided_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Admin</h2>
          <p style={{ marginTop: 0 }}>
            <strong>{adminEmail()}</strong>
          </p>
        </section>

        <section className="panel">
          <h2>This session</h2>
          <p style={{ marginTop: 0 }}>
            {viewer.name} · {viewer.email} · {viewer.access?.role}
          </p>
          <form action={signOut}>
            <button type="submit" className="btn-ghost">
              Sign out
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
