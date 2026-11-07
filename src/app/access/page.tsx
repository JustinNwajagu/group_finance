import { connection } from "next/server";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { requireAdmin, adminEmail } from "@/lib/auth";

export const instant = false;

export default async function AccessPage() {
  await connection();
  const viewer = await requireAdmin();

  return (
    <AppShell viewer={viewer} active="access">
      <div className="page-head">
        <div>
          <h1>Access</h1>
          <p>Admin mailbox and this session.</p>
        </div>
      </div>

      <div className="stack">
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
