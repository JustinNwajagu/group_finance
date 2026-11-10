import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { ViewerContext } from "@/lib/auth";
import { homePathForRole, isAdmin } from "@/lib/auth";

export function AppShell({
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
    | "access"
    | "profile";
  children: React.ReactNode;
}) {
  const admin = isAdmin(viewer);
  const homeHref = homePathForRole(viewer.access?.role ?? "member");

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
          {admin ? (
            <Link
              href="/access"
              prefetch
              className={active === "access" ? "nav-link active" : "nav-link"}
            >
              Access
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
            {viewer.access?.role ?? "guest"}
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
      <main className="main">{children}</main>
    </div>
  );
}
