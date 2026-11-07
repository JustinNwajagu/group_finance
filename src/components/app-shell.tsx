import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import type { ViewerContext } from "@/lib/auth";
import { homePathForRole, isAdmin } from "@/lib/auth";

export function AppShell({
  viewer,
  active,
  children,
}: {
  viewer: ViewerContext;
  active: "home" | "payments" | "archive" | "access";
  children: React.ReactNode;
}) {
  const admin = isAdmin(viewer);
  const homeHref = homePathForRole(viewer.access?.role ?? "member");

  return (
    <div className="shell">
      <header className="topbar">
        <Link href={homeHref} className="brand">
          <BrandLogo size={36} />
          <span className="brand-mark">KLEF</span>
          <span className="brand-sub">Ledger</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link
            href="/"
            className={active === "home" ? "nav-link active" : "nav-link"}
          >
            Home
          </Link>
          <Link
            href="/payments"
            className={active === "payments" ? "nav-link active" : "nav-link"}
          >
            Payments
          </Link>
          <Link
            href="/archive"
            className={active === "archive" ? "nav-link active" : "nav-link"}
          >
            Archive
          </Link>
          {admin ? (
            <Link
              href="/access"
              className={active === "access" ? "nav-link active" : "nav-link"}
            >
              Access
            </Link>
          ) : null}
        </nav>
        <div className="viewer">
          <span className="viewer-name">{viewer.name}</span>
          <span className="viewer-role">
            {viewer.access?.role ?? "guest"}
            {viewer.simulated ? " · local preview" : ""}
          </span>
          <form action={signOut} style={{ margin: 0 }}>
            <button
              type="submit"
              className="btn-ghost"
              style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
