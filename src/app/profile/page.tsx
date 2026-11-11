import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { ProfilePasswordReset } from "@/components/profile-password-reset";
import { requireAccess } from "@/lib/auth";
import { firebaseClientConfig } from "@/lib/config";
import { getExcoSeatForEmail } from "@/lib/exco";
import { getMemberByLoginEmail } from "@/lib/store";

export const instant = false;

export default async function ProfilePage() {
  await connection();
  const viewer = await requireAccess();
  const [member, exco] = await Promise.all([
    getMemberByLoginEmail(viewer.email),
    getExcoSeatForEmail(viewer.email),
  ]);
  const config = firebaseClientConfig();

  return (
    <AppShell viewer={viewer} active="profile">
      <div className="page-head">
        <div>
          <h1>Your account</h1>
          <p>
            Credentials for your login only. Other members do not see this
            page.
          </p>
        </div>
      </div>

      <div className="stack" style={{ maxWidth: "32rem" }}>
        <section className="panel">
          <h2>Login</h2>
          <dl className="profile-dl">
            <div>
              <dt>Name</dt>
              <dd>{viewer.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{viewer.email}</dd>
            </div>
            <div>
              <dt>EXCO</dt>
              <dd>{exco ? exco.label : "—"}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd style={{ textTransform: "capitalize" }}>
                {viewer.access?.role ?? "member"}
                {exco && !exco.grants_admin
                  ? " (EXCO without admin rights)"
                  : ""}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h2>Roster link</h2>
          {member ? (
            <dl className="profile-dl">
              <div>
                <dt>Member name</dt>
                <dd>
                  <Link className="row-link" href={`/members/${member.id}`}>
                    {member.name}
                  </Link>
                </dd>
              </div>
              {member.phone ? (
                <div>
                  <dt>Phone</dt>
                  <dd>{member.phone}</dd>
                </div>
              ) : null}
              {member.email &&
              member.email.toLowerCase() !== viewer.email.toLowerCase() ? (
                <div>
                  <dt>Contact email</dt>
                  <dd>{member.email}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Your login is not linked to a roster member yet. An admin can
              connect it on Access after approving your account.
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Password</h2>
          <ProfilePasswordReset
            email={viewer.email}
            firebaseConfig={config}
          />
        </section>
      </div>
    </AppShell>
  );
}
