import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isAdmin, requireAdmin } from "@/lib/auth";
import {
  formatAuditAction,
  listAuditEvents,
} from "@/lib/audit-log";

export const instant = false;

function formatWhenLondon(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function ChangelogPage() {
  await connection();
  const viewer = await requireAdmin();
  if (!isAdmin(viewer)) redirect("/");

  const events = await listAuditEvents(250);

  return (
    <AppShell viewer={viewer} active="changelog">
      <div className="page-head">
        <div>
          <h1>Changelog</h1>
          <p>
            Open/close of contributions and dues, archive dues amends, edits on
            open contribution titles, expenses, imports, and login removals.
            Account approvals and other access maintenance are not listed.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>Recent changes</h2>
        {events.length === 0 ? (
          <div className="hero-empty">
            No changes recorded yet. New edits will appear here as admins and
            members update the app.
          </div>
        ) : (
          <div className="scroll-panel">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Account</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {formatWhenLondon(event.created_at)}
                        <span className="sr-only"> Europe/London</span>
                      </td>
                      <td>
                        <div>{event.actor_name}</div>
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {event.actor_email}
                          {event.view_as === "member" ? " · member view" : ""}
                        </div>
                      </td>
                      <td>{formatAuditAction(event.action)}</td>
                      <td>{event.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
