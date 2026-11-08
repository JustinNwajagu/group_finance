import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { adminAuth } from "./firebase-admin";
import { adminEmail, firebaseAdminConfigured } from "./config";
import { resolveAppRole } from "./user-roles";
import type { AppRole, AppUser } from "./types";

export const SESSION_COOKIE = "__session";
export const DEV_SESSION_COOKIE = "klef_dev_session";

export type ViewerContext = {
  sub: string;
  email: string;
  name: string;
  simulated: boolean;
  access: AppUser | null;
};

async function viewerFromIdentity(input: {
  sub: string;
  email: string;
  name: string;
  simulated: boolean;
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
  return {
    sub: input.sub,
    email,
    name: access.name,
    simulated: input.simulated,
    access,
  };
}

export async function resolveViewer(): Promise<ViewerContext | null> {
  await connection();
  const jar = await cookies();

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
    });
  } catch {
    return null;
  }
}

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
  if (viewer.access.role !== "admin") redirect("/");
  return viewer;
}

export function isAdmin(viewer: ViewerContext): boolean {
  return viewer.access?.role === "admin";
}

/** Post-login landing: admins go to Payments, members to Home. */
export function homePathForRole(role: AppRole): string {
  return role === "admin" ? "/payments" : "/";
}

export { adminEmail };
