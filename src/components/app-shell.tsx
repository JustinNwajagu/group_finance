import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { ViewerContext } from "@/lib/auth";
import { homePathForRole, isAdmin } from "@/lib/auth";
import { countPendingAccessRequests } from "@/lib/access-requests";
import { getExcoSeatForEmail } from "@/lib/exco";

export async function AppShell({
  viewer,
  active,
  children,
}: {
  viewer: ViewerContext;
  active:
    | "home"
    | "payments"
    | "dues"
    | "expenses"
    | "archive"
    | "regulations"
    | "access"
    | "profile";
  children: React.ReactNode;
}) {
  const admin = isAdmin(viewer);
  const homeHref = homePathForRole(viewer.access?.role ?? "member");
  const [exco, pendingAccessCount] = await Promise.all([
    getExcoSeatForEmail(viewer.email),
    admin ? countPendingAccessRequests() : Promise.resolve(0),
  ]);
  const roleLabel = exco
    ? exco.label
    : (viewer.access?.role ?? "guest");
  const showAccessAlert = admin && pendingAccessCount > 0;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href={homeHref} className="brand">
          <BrandLogo size={36} />
          <span className="brand-mark">KLEF 13</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link
            href="/"
            prefetch
            className={active === "home" ? "nav-link active" : "nav-link"}
          >
            Home
          </Link>
          <Link
            href="/payments"
            prefetch
            className={active === "payments" ? "nav-link active" : "nav-link"}
          >
            Contributions
          </Link>
          <Link
            href="/dues"
            prefetch
            className={active === "dues" ? "nav-link active" : "nav-link"}
          >
            Dues
          </Link>
          <Link
            href="/expenses"
            prefetch
            className={active === "expenses" ? "nav-link active" : "nav-link"}
          >
            Expenses
          </Link>
          <Link
            href="/archive"
            prefetch
            className={active === "archive" ? "nav-link active" : "nav-link"}
          >
            Archive
          </Link>
          <Link
            href="/regulations"
            prefetch
            className={
              active === "regulations" ? "nav-link active" : "nav-link"
            }
          >
            Regulations
          </Link>
          {admin ? (
            <Link
              href="/access"
              prefetch
              className={
                active === "access"
                  ? "nav-link active nav-link-with-badge"
                  : "nav-link nav-link-with-badge"
              }
              aria-label={
                pendingAccessCount > 0
                  ? `Access, ${pendingAccessCount} pending request${pendingAccessCount === 1 ? "" : "s"}`
                  : "Access"
              }
            >
              Access
              {pendingAccessCount > 0 ? (
                <span className="nav-count" aria-hidden="true">
                  {pendingAccessCount > 9 ? "9+" : pendingAccessCount}
                </span>
              ) : null}
            </Link>
          ) : null}
        </nav>
        <div className="viewer">
          <Link
            href="/profile"
            className={
              active === "profile" ? "viewer-name is-active" : "viewer-name"
            }
            title="Your account"
          >
            {viewer.name}
          </Link>
          <span className="viewer-role">
            {roleLabel}
            {exco?.grants_admin ? " · admin" : ""}
            {viewer.simulated ? " · local preview" : ""}
          </span>
          <form action={signOut} style={{ margin: 0 }}>
            <PendingSubmitButton
              className="btn-ghost"
              style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem" }}
              idleLabel="Sign out"
              pendingLabel="Signing out…"
            />
          </form>
        </div>
      </header>
      {showAccessAlert ? (
        <div className="admin-alert" role="status">
          <p>
            {pendingAccessCount === 1
              ? "1 new login request is waiting for approval."
              : `${pendingAccessCount} new login requests are waiting for approval.`}
          </p>
          {active === "access" ? (
            <span className="admin-alert-meta">Review below</span>
          ) : (
            <Link href="/access" className="admin-alert-link">
              Review on Access
            </Link>
          )}
        </div>
      ) : null}
      <main className="main">{children}</main>
    </div>
  );
}
