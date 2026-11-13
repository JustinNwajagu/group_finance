import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAuth } from "./firebase-admin";
import { adminEmail, firebaseAdminConfigured } from "./config";
import { resolveAppRole } from "./user-roles";
import type { AppRole, AppUser } from "./types";

export const SESSION_COOKIE = "__session";
export const DEV_SESSION_COOKIE = "klef_dev_session";
/** Client + server readable timestamp (ms) of last user activity. */
export const LAST_ACTIVE_COOKIE = "klef_last_active";
/** True admins may preview the member UI without losing admin rights. */
export const VIEW_AS_COOKIE = "klef_view_as";

export type ViewAsMode = "admin" | "member";

/** Default idle window before the next visit requires sign-in again. */
export const DEFAULT_SESSION_IDLE_MINUTES = 15;

export function sessionIdleMinutes(): number {
  const raw = Number(process.env.SESSION_IDLE_MINUTES ?? DEFAULT_SESSION_IDLE_MINUTES);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_SESSION_IDLE_MINUTES;
  return Math.min(24 * 60, Math.floor(raw));
}

export function sessionIdleMs(): number {
  return sessionIdleMinutes() * 60 * 1000;
}

export const IDLE_SIGNED_OUT_MESSAGE =
  "Signed out after inactivity. Sign in again to continue.";

export type ViewerContext = {
  sub: string;
  email: string;
  name: string;
  simulated: boolean;
  access: AppUser | null;
  /** Effective UI mode. Only true admins may set this to `"member"`. */
  viewAs: ViewAsMode;
};

async function viewerFromIdentity(input: {
  sub: string;
  email: string;
  name: string;
  simulated: boolean;
  viewAs?: ViewAsMode;
}): Promise<ViewerContext> {
  const email = input.email.trim().toLowerCase();
  const role = await resolveAppRole(email);
  const access: AppUser = {
    id: 0,
    cursor_sub: input.sub,
    email,
    name: input.name.trim() || email,
    role,
    created_at: new Date().toISOString(),
  };
  const viewAs: ViewAsMode =
    role === "admin" && input.viewAs === "member" ? "member" : "admin";
  return {
    sub: input.sub,
    email,
    name: access.name,
    simulated: input.simulated,
    access,
    viewAs: role === "admin" ? viewAs : "member",
  };
}

export const resolveViewer = cache(async (): Promise<ViewerContext | null> => {
  await connection();
  const jar = await cookies();
  const cookieViewAs = jar.get(VIEW_AS_COOKIE)?.value;
  const viewAs: ViewAsMode | undefined =
    cookieViewAs === "member" ? "member" : cookieViewAs === "admin" ? "admin" : undefined;

  if (firebaseAdminConfigured()) {
    const session = jar.get(SESSION_COOKIE)?.value;
    if (!session) return null;
    const auth = adminAuth();
    if (!auth) return null;
    try {
      const decoded = await auth.verifySessionCookie(session, true);
      const email = (decoded.email ?? "").trim();
      if (!email) return null;
      return viewerFromIdentity({
        sub: decoded.uid,
        email,
        name: (decoded.name as string | undefined) || email,
        simulated: false,
        viewAs,
      });
    } catch {
      return null;
    }
  }

  // Local preview without Firebase credentials — session set via /login.
  const raw = jar.get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      email?: string;
      name?: string;
      sub?: string;
    };
    if (!parsed.email) return null;
    return viewerFromIdentity({
      sub: parsed.sub || `local:${parsed.email}`,
      email: parsed.email,
      name: parsed.name || parsed.email,
      simulated: true,
      viewAs,
    });
  } catch {
    return null;
  }
});

export async function requireSignedIn(): Promise<ViewerContext> {
  const viewer = await resolveViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireAccess(): Promise<
  ViewerContext & { access: AppUser }
> {
  const viewer = await requireSignedIn();
  if (!viewer.access) redirect("/login");
  return viewer as ViewerContext & { access: AppUser };
}

export async function requireAdmin(): Promise<
  ViewerContext & { access: AppUser }
> {
  const viewer = await requireAccess();
  if (!isTrueAdmin(viewer)) redirect("/");
  return viewer;
}

/** True account role is admin (ignores member-view preview). */
export function isTrueAdmin(viewer: ViewerContext): boolean {
  return viewer.access?.role === "admin";
}

/**
 * Effective admin for UI / tools. False when a true admin is previewing as
 * member so they can verify what members see.
 */
export function isAdmin(viewer: ViewerContext): boolean {
  return isTrueAdmin(viewer) && viewer.viewAs !== "member";
}

/** Post-login landing for every role. */
export function homePathForRole(role: AppRole): string {
  void role;
  return "/";
}

export { adminEmail };
