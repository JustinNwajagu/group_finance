import { connection } from "next/server";
import { signOut } from "@/app/actions/auth";
import {
  deleteLoginAction,
  rejectAccessRequest,
  sendMemberPasswordReset,
} from "@/app/actions/access-requests";
import { assignExcoOfficeAction } from "@/app/actions/exco";
import { ApproveAccessForm } from "@/components/approve-access-form";
import { AppShell } from "@/components/app-shell";
import { Flash } from "@/components/flash";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireAdmin, adminEmail } from "@/lib/auth";
import {
  listAccessRequests,
  listMembersWithoutLogin,
  loginCapacity,
} from "@/lib/access-requests";
import { isAdminEmail } from "@/lib/config";
import { listExcoSeatViews } from "@/lib/exco";
import { formatTimestamp } from "@/lib/format";
import { listAllMembers, listMembersWithLogin } from "@/lib/store";
import { ensurePrimaryAdminRole, resolveAppRole } from "@/lib/user-roles";

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
  const [pending, unlinkable, withLogin, capacity, allMembers, excoSeats] =
    await Promise.all([
      listAccessRequests("pending"),
      listMembersWithoutLogin(),
      listMembersWithLogin(),
      loginCapacity(),
      listAllMembers(),
      listExcoSeatViews(),
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
  const excoByMemberId = new Map(
    excoSeats
      .filter((s) => s.member_id != null)
      .map((s) => [s.member_id as number, s]),
  );

  return (
    <AppShell viewer={viewer} active="access">
      <div className="page-head">
        <div>
          <h1>Access</h1>
          <p>
            Roster members do not get login automatically. Approve requests by
            linking to an existing member or creating a new one. Logins cannot
            exceed the member count ({capacity.logins}/{capacity.members} used).
            Admin rights follow EXCO offices (President and Treasurer only).
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
          exco_updated: "EXCO position updated.",
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
          <h2>EXCO positions</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Move offices after an election. Only President and Treasurer have
            admin rights; other EXCO roles are visible but not admin.
          </p>
          <div className="exco-assign-grid">
            {excoSeats.map((seat) => (
              <form
                key={seat.office}
                action={assignExcoOfficeAction}
                className="exco-assign-card"
              >
                <input type="hidden" name="office" value={seat.office} />
                <div className="exco-assign-head">
                  <strong>{seat.label}</strong>
                  {seat.grants_admin ? (
                    <span className="badge badge-admin">admin</span>
                  ) : (
                    <span className="badge badge-exco">exco</span>
                  )}
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  Slate: {seat.holder_name}
                </p>
                <label className="field">
                  Member
                  <select
                    name="member_id"
                    defaultValue={
                      seat.member_id != null ? String(seat.member_id) : "none"
                    }
                    aria-label={`Assign ${seat.label}`}
                  >
                    <option value="none">Vacant</option>
                    {allMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {excoByMemberId.get(m.id)?.office === seat.office
                          ? ""
                          : excoByMemberId.has(m.id)
                            ? ` (currently ${excoByMemberId.get(m.id)!.label})`
                            : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <PendingSubmitButton
                  idleLabel={`Save ${seat.label}`}
                  pendingLabel="Saving…"
                />
              </form>
            ))}
          </div>
        </section>

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

                  <ApproveAccessForm
                    requestId={r.id}
                    unlinkable={unlinkable}
                    atLoginCap={atLoginCap}
                  />

                  <form action={rejectAccessRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <PendingSubmitButton
                      className="btn-ghost"
                      idleLabel="Reject"
                      pendingLabel="Rejecting…"
                    />
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
            the roster. Admin access is granted by EXCO office (President /
            Treasurer), not by a separate role toggle.
          </p>
          {withLogin.length === 0 ? (
            <div className="hero-empty">No member logins yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Login email</th>
                    <th>Access</th>
                    <th>Phone</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {withLogin.map((m) => {
                    const email = (m.login_email || m.email || "").toLowerCase();
                    const role = roleByEmail.get(email) ?? "member";
                    const seat = excoByMemberId.get(m.id);
                    const locked = isAdminEmail(email);
                    return (
                      <tr key={m.id}>
                        <td>
                          <div className="member-exco-cell">
                            <span>{m.name}</span>
                            {seat ? (
                              <span
                                className={
                                  seat.grants_admin
                                    ? "badge badge-admin"
                                    : "badge badge-exco"
                                }
                              >
                                {seat.label}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>{email || "—"}</td>
                        <td>
                          <div className="member-exco-cell">
                            {locked ? (
                              <span className="badge badge-admin">
                                primary admin
                              </span>
                            ) : role === "admin" ? (
                              <span className="badge badge-admin">admin</span>
                            ) : (
                              <span className="badge badge-member">member</span>
                            )}
                          </div>
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
                              <PendingSubmitButton
                                className="btn-ghost"
                                idleLabel="Reset password"
                                pendingLabel="Sending…"
                              />
                            </form>
                            {!locked ? (
                              <form action={deleteLoginAction}>
                                <input
                                  type="hidden"
                                  name="member_id"
                                  value={m.id}
                                />
                                <PendingSubmitButton
                                  className="btn-ghost"
                                  idleLabel="Delete login"
                                  pendingLabel="Deleting…"
                                />
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Primary admin</h2>
          <p style={{ marginTop: 0 }}>
            <strong>{primaryAdmin}</strong> is a break-glass admin mailbox and
            cannot be demoted. Day-to-day admin rights belong to the President
            and Treasurer EXCO offices.
          </p>
        </section>

        <section className="panel">
          <h2>This session</h2>
          <p style={{ marginTop: 0 }}>
            {viewer.name} · {viewer.email} · {viewer.access?.role}
          </p>
          <form action={signOut}>
            <PendingSubmitButton
              className="btn-ghost"
              idleLabel="Sign out"
              pendingLabel="Signing out…"
            />
          </form>
        </section>
      </div>
    </AppShell>
  );
}
