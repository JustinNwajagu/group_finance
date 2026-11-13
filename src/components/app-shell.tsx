import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  PrimaryNav,
  type PrimaryNavItem,
} from "@/components/primary-nav";
import { SessionIdleGuard } from "@/components/session-idle-guard";
import { ViewAsSwitch } from "@/components/view-as-switch";
import type { ViewerContext } from "@/lib/auth";
import {
  homePathForRole,
  isAdmin,
  isTrueAdmin,
  sessionIdleMs,
} from "@/lib/auth";
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
  const trueAdmin = isTrueAdmin(viewer);
  const homeHref = homePathForRole(viewer.access?.role ?? "member");
  const [exco, pendingAccessCount] = await Promise.all([
    getExcoSeatForEmail(viewer.email),
    admin ? countPendingAccessRequests() : Promise.resolve(0),
  ]);
  const roleLabel = exco
    ? exco.label
    : (viewer.access?.role ?? "guest");
  const showAccessAlert = admin && pendingAccessCount > 0;
  const navItems: PrimaryNavItem[] = [
    { href: "/", label: "Home", active: active === "home" },
    {
      href: "/payments",
      label: "Contributions",
      active: active === "payments",
    },
    { href: "/dues", label: "Dues", active: active === "dues" },
    { href: "/expenses", label: "Expenses", active: active === "expenses" },
    { href: "/archive", label: "Archive", active: active === "archive" },
    {
      href: "/regulations",
      label: "Regulations",
      active: active === "regulations",
    },
  ];
  if (admin) {
    navItems.push({
      href: "/access",
      label: "Access",
      active: active === "access",
      badge: pendingAccessCount,
    });
  }

  const signOutControl = (
    <PendingSubmitButton
      className="btn-ghost nav-sign-out"
      style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem" }}
      idleLabel="Sign out"
      pendingLabel="Signing out…"
    />
  );

  return (
    <div className="shell">
      <SessionIdleGuard idleMs={sessionIdleMs()} />
      <header className="topbar">
        <Link href={homeHref} className="brand">
          <BrandLogo size={36} />
          <span className="brand-mark">KLEF 13</span>
        </Link>
        <PrimaryNav
          items={navItems}
          mobileExtra={
            <form action={signOut} style={{ margin: 0 }}>
              <PendingSubmitButton
                className="btn-ghost nav-sign-out"
                style={{ padding: "0.65rem 0.85rem", fontSize: "0.95rem" }}
                idleLabel="Sign out"
                pendingLabel="Signing out…"
              />
            </form>
          }
        />
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
            {viewer.viewAs === "member" && trueAdmin
              ? " · viewing as member"
              : ""}
            {viewer.simulated ? " · local preview" : ""}
          </span>
          {trueAdmin ? <ViewAsSwitch viewAs={viewer.viewAs} /> : null}
          <form
            action={signOut}
            className="viewer-sign-out"
            style={{ margin: 0 }}
          >
            {signOutControl}
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
      {trueAdmin && viewer.viewAs === "member" ? (
        <div className="view-as-banner" role="status">
          <p>You are previewing the member view. Admin tools are hidden.</p>
          <ViewAsSwitch viewAs={viewer.viewAs} />
        </div>
      ) : null}
      <main className="main">{children}</main>
    </div>
  );
}
