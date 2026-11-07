import { connection } from "next/server";
import { inviteUser, setUserRole } from "@/app/actions/access";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { RoleForm } from "@/components/forms";
import { requireAdmin } from "@/lib/auth";
import { listAppUsers } from "@/lib/data";
import { formatTimestamp } from "@/lib/format";

export const instant = false;

export default async function AccessPage({
  searchParams,
}: PageProps<"/access">) {
  await connection();
  const viewer = await requireAdmin();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const ok = typeof params.ok === "string" ? params.ok : undefined;
  const users = await listAppUsers();

  return (
    <AppShell viewer={viewer} active="access">
      <div className="page-head">
        <div>
          <h1>Access</h1>
          <p>
            Grant app access and assign admin or member roles. Pending visitors
            appear after their first sign-in.
          </p>
        </div>
      </div>

      <Flash
        ok={ok}
        error={error}
        messages={{ "1": "Access granted." }}
      />

      <div className="split split-2">
        <section className="panel">
          <h2>People</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div>{u.name || u.email}</div>
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {u.email}
                        {!u.cursor_sub ? " · invited" : ""}
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span className={`badge badge-${u.role}`}>{u.role}</span>
                        <RoleForm action={setUserRole} id={u.id} role={u.role} />
                      </div>
                    </td>
                    <td className="muted">{formatTimestamp(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Invite by email</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Pre-grant access before someone signs in. Matching is by email.
          </p>
          <form action={inviteUser} className="form-grid">
            <label className="field">
              Email
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label className="field">
              Name (optional)
              <input name="name" autoComplete="off" />
            </label>
            <label className="field">
              Role
              <select name="role" defaultValue="member">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button type="submit" className="btn-primary">
              Grant access
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
