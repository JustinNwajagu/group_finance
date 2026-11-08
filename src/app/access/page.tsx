import { connection } from "next/server";
import { signOut } from "@/app/actions/auth";
import {
  approveAccessRequest,
  deleteLoginAction,
  rejectAccessRequest,
  sendMemberPasswordReset,
  setUserRoleAction,
} from "@/app/actions/access-requests";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { requireAdmin, adminEmail } from "@/lib/auth";
import {
  listAccessRequests,
  listMembersWithoutLogin,
  loginCapacity,
} from "@/lib/access-requests";
import { isAdminEmail } from "@/lib/config";
import { listMembersWithLogin } from "@/lib/store";
import { formatTimestamp } from "@/lib/format";
import {
  ensurePrimaryAdminRole,
  listUserRoles,
  resolveAppRole,
} from "@/lib/user-roles";

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
  await ensurePrimaryAdminRole();
  const [pending, unlinkable, withLogin, capacity, storedRoles] =
    await Promise.all([
      listAccessRequests("pending"),
      listMembersWithoutLogin(),
      listMembersWithLogin(),
      loginCapacity(),
      listUserRoles(),
    ]);
  const atLoginCap = capacity.remaining < 1;
  const roleByEmail = new Map(
    await Promise.all(
      withLogin.map(async (m) => {
        const email = (m.login_email || m.email || "").toLowerCase();
        return [email, email ? await resolveAppRole(email) : "member"] as const;
      }),
    ),
  );
  const primaryAdmin = adminEmail();
  const loginEmails = new Set(
    withLogin
      .map((m) => (m.login_email || m.email || "").toLowerCase())
      .filter(Boolean),
  );
  const extraRoles = storedRoles.filter((r) => !loginEmails.has(r.email));

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
          login_deleted: "Login removed. The member stays on the roster.",
          reset_sent: "Password reset link ready to share.",
          role_updated: "User role updated.",
        }}
      />

      {link ? (
        <section className="panel">
          <h2>Password setup / reset link</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Send this one-time link so they can set a new password:
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
          <h2>Active logins</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Deleting a login removes sign-in access only. The member stays on
            the roster. Admins can promote or demote logins between{" "}
            <strong>admin</strong> and <strong>member</strong>.
          </p>
          {withLogin.length === 0 && extraRoles.length === 0 ? (
            <div className="hero-empty">No member logins yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Login email</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {withLogin.map((m) => {
                    const email = (m.login_email || m.email || "").toLowerCase();
                    const role = roleByEmail.get(email) ?? "member";
                    const locked = isAdminEmail(email);
                    return (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{email || "—"}</td>
                        <td>
                          {locked ? (
                            <span className="badge badge-admin">admin</span>
                          ) : (
                            <form
                              action={setUserRoleAction}
                              className="inline-form"
                              style={{
                                display: "flex",
                                gap: "0.35rem",
                                alignItems: "center",
                              }}
                            >
                              <input type="hidden" name="email" value={email} />
                              <select
                                name="role"
                                defaultValue={role}
                                aria-label={`Role for ${m.name}`}
                              >
                                <option value="member">member</option>
                                <option value="admin">admin</option>
                              </select>
                              <button type="submit" className="btn-ghost">
                                Save
                              </button>
                            </form>
                          )}
                        </td>
                        <td>{m.phone || "—"}</td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "0.35rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <form action={sendMemberPasswordReset}>
                              <input
                                type="hidden"
                                name="member_id"
                                value={m.id}
                              />
                              <button type="submit" className="btn-ghost">
                                Reset password
                              </button>
                            </form>
                            {!locked ? (
                              <form action={deleteLoginAction}>
                                <input
                                  type="hidden"
                                  name="member_id"
                                  value={m.id}
                                />
                                <button type="submit" className="btn-ghost">
                                  Delete login
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {extraRoles.map((row) => (
                    <tr key={`role-${row.email}`}>
                      <td className="muted">
                        {row.email === primaryAdmin
                          ? "Primary admin"
                          : "Account"}
                      </td>
                      <td>{row.email}</td>
                      <td>
                        {isAdminEmail(row.email) ? (
                          <span className="badge badge-admin">admin</span>
                        ) : (
                          <form
                            action={setUserRoleAction}
                            className="inline-form"
                            style={{
                              display: "flex",
                              gap: "0.35rem",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="hidden"
                              name="email"
                              value={row.email}
                            />
                            <select
                              name="role"
                              defaultValue={row.role}
                              aria-label={`Role for ${row.email}`}
                            >
                              <option value="member">member</option>
                              <option value="admin">admin</option>
                            </select>
                            <button type="submit" className="btn-ghost">
                              Save
                            </button>
                          </form>
                        )}
                      </td>
                      <td className="muted">—</td>
                      <td className="muted">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Primary admin</h2>
          <p style={{ marginTop: 0 }}>
            <strong>{primaryAdmin}</strong> is always an admin and cannot be
            demoted.
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
