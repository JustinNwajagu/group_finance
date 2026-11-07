import { connection } from "next/server";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { requireAdmin, adminEmail } from "@/lib/auth";
import { storeBackend } from "@/lib/store";
import { firebaseAdminConfigured, firebaseClientConfig } from "@/lib/config";

export const instant = false;

export default async function AccessPage() {
  await connection();
  const viewer = await requireAdmin();
  const backend = await storeBackend();

  return (
    <AppShell viewer={viewer} active="access">
      <div className="page-head">
        <div>
          <h1>Access</h1>
          <p>
            Authentication and data run on Firebase. Only one mailbox is admin;
            every other signed-in user is a member.
          </p>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <h2>Admin mailbox</h2>
          <p style={{ marginTop: 0 }}>
            <strong>{adminEmail()}</strong>
          </p>
          <p className="muted">
            Set with the <code>ADMIN_EMAIL</code> environment variable. Signed-in
            users whose email does not match this address get the member role
            automatically.
          </p>
        </section>

        <section className="panel">
          <h2>This session</h2>
          <p style={{ marginTop: 0 }}>
            {viewer.name} · {viewer.email} · {viewer.access?.role}
            {viewer.simulated ? " · local preview" : ""}
          </p>
          <p className="muted">
            Auth:{" "}
            {firebaseAdminConfigured() && firebaseClientConfig()
              ? "Firebase"
              : "local preview (Firebase credentials not set)"}
            <br />
            Database: {backend === "firestore" ? "Cloud Firestore" : "local file store"}
          </p>
          <form action={signOut}>
            <button type="submit" className="btn-primary">
              Sign out
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
