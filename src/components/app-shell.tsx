import Link from "next/link";
import type { ViewerContext } from "@/lib/auth";
import { isAdmin } from "@/lib/auth";

export function AppShell({
  viewer,
  active,
  children,
}: {
  viewer: ViewerContext;
  active: "members" | "payments" | "access";
  children: React.ReactNode;
}) {
  const admin = isAdmin(viewer);

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/members" className="brand">
          <span className="brand-mark">KLEF</span>
          <span className="brand-sub">Ledger</span>
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link
            href="/members"
            className={active === "members" ? "nav-link active" : "nav-link"}
          >
            Members
          </Link>
          <Link
            href="/payments"
            className={active === "payments" ? "nav-link active" : "nav-link"}
          >
            Payments
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
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
