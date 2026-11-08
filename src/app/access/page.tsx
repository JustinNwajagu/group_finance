import { connection } from "next/server";
import { signOut } from "@/app/actions/auth";
import {
  approveAccessRequest,
  rejectAccessRequest,
} from "@/app/actions/access-requests";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { requireAdmin, adminEmail } from "@/lib/auth";
import {
  listAccessRequests,
  listMembersWithoutLogin,
  loginCapacity,
} from "@/lib/access-requests";
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
  const error = typeof params.error === "string" ? params.error : undefined;
  const link = typeof params.link === "string" ? params.link : undefined;
  const [pending, recent, unlinkable, capacity] = await Promise.all([
    listAccessRequests("pending"),
    listAccessRequests(),
    listMembersWithoutLogin(),
    loginCapacity(),
  ]);
  const decided = recent.filter((r) => r.status !== "pending").slice(0, 20);
  const atLoginCap = capacity.remaining < 1;

  return (
    <AppShell viewer={viewer} active="access">
      <div className="page-head">
        <div>
          <h1>Access</h1>
          <p>
            Roster members do not get login automatically. Approve requests by
            linking to an existing member or creating a new one. Logins cannot
            exceed the member count ({capacity.logins}/{capacity.members} used).
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{
          approved:
            "Request approved. Share the password link with the member.",
          rejected: "Request rejected.",
        }}
      />

      {link ? (
        <section className="panel">
          <h2>Password setup link</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Send this one-time link to the new user so they can set a password:
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
            <div className="stack" style={{ gap: "1rem" }}>
              {pending.map((r) => (
                <div key={r.id} className="access-request-card">
                  <div>
                    <strong>{r.name}</strong>
                    <div className="muted">
                      {r.email} · {r.phone} · {formatTimestamp(r.created_at)}
                    </div>
                  </div>

                  <form action={approveAccessRequest} className="form-grid">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="field">
                      Link login to
                      <select name="link_mode" required defaultValue="">
                        <option value="" disabled>
                          Choose…
                        </option>
                        <option
                          value="link"
                          disabled={unlinkable.length === 0 || atLoginCap}
                        >
                          Existing member
                          {unlinkable.length === 0
                            ? " (none available)"
                            : atLoginCap
                              ? " (login limit reached)"
                              : ""}
                        </option>
                        <option value="create">Create new member</option>
                      </select>
                    </label>
                    <label className="field">
                      Existing member
                      <select
                        name="member_id"
                        defaultValue=""
                        disabled={unlinkable.length === 0}
                      >
                        <option value="" disabled>
                          Select member without a login
                        </option>
                        {unlinkable.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.email ? ` · ${m.email}` : ""}
                            {m.phone ? ` · ${m.phone}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button type="submit" className="btn-primary">
                        Approve &amp; create login
                      </button>
                    </div>
                  </form>

                  <form action={rejectAccessRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn-ghost">
                      Reject
                    </button>
                  </form>
                </div>
              ))}
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
                    <th>Member</th>
                    <th>Decided</th>
                  </tr>
                </thead>
                <tbody>
                  {decided.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.email}</td>
                      <td>{r.status}</td>
                      <td>{r.member_id ?? "—"}</td>
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
