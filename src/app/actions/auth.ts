"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase-admin";
import {
  DEV_SESSION_COOKIE,
  IDLE_SIGNED_OUT_MESSAGE,
  LAST_ACTIVE_COOKIE,
  SESSION_COOKIE,
  VIEW_AS_COOKIE,
  homePathForRole,
  isTrueAdmin,
  requireAccess,
  sessionIdleMs,
  type ViewAsMode,
} from "@/lib/auth";
import { firebaseAdminConfigured, isAdminEmail } from "@/lib/config";
import {
  emailIsApproved,
  findPendingOrApprovedByEmail,
} from "@/lib/access-requests";
import { resolveAppRole } from "@/lib/user-roles";
import type { AppRole } from "@/lib/types";

const SESSION_DAYS = 14;

function setLastActiveCookie(
  jar: Awaited<ReturnType<typeof cookies>>,
  when = Date.now(),
) {
  jar.set(LAST_ACTIVE_COOKIE, String(when), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

function clearSessionCookies(jar: Awaited<ReturnType<typeof cookies>>) {
  jar.delete(SESSION_COOKIE);
  jar.delete(DEV_SESSION_COOKIE);
  jar.delete(LAST_ACTIVE_COOKIE);
  jar.delete(VIEW_AS_COOKIE);
}

function safeReturnPath(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

/** True admins preview the member UI (or restore admin UI). */
export async function setViewAs(formData: FormData): Promise<void> {
  const viewer = await requireAccess();
  if (!isTrueAdmin(viewer)) redirect("/");

  const requested = String(formData.get("view_as") ?? "").trim();
  const mode: ViewAsMode = requested === "member" ? "member" : "admin";
  const returnTo = safeReturnPath(String(formData.get("return_to") ?? "/"));

  const jar = await cookies();
  jar.set(VIEW_AS_COOKIE, mode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  if (mode === "member" && returnTo.startsWith("/access")) {
    redirect("/");
  }
  redirect(returnTo);
}

export async function createFirebaseSession(
  idToken: string,
): Promise<
  | { ok: true; role: AppRole; redirectTo: string }
  | { ok: false; error: string; kind?: "no_account" | "pending" | "other" }
> {
  if (!firebaseAdminConfigured()) {
    return { ok: false, error: "Sign-in is not configured.", kind: "other" };
  }
  const auth = adminAuth();
  if (!auth) {
    return { ok: false, error: "Sign-in is unavailable right now.", kind: "other" };
  }

  try {
    const decoded = await auth.verifyIdToken(idToken);
    const email = (decoded.email ?? "").trim().toLowerCase();
    if (!email) {
      return {
        ok: false,
        error: "That account has no email address.",
        kind: "other",
      };
    }

    if (!isAdminEmail(email)) {
      const approved = await emailIsApproved(email);
      if (!approved) {
        const request = await findPendingOrApprovedByEmail(email);
        if (request?.status === "pending") {
          return {
            ok: false,
            error:
              "Your access request is waiting for admin approval. You cannot sign in yet.",
            kind: "pending",
          };
        }
        // Delete auto-created Google Auth users that were never approved.
        const provider = decoded.firebase?.sign_in_provider;
        if (provider === "google.com") {
          try {
            await auth.deleteUser(decoded.uid);
          } catch {
            /* ignore */
          }
        }
        return {
          ok: false,
          error:
            "No approved account for this email. Request access so an admin can approve you.",
          kind: "no_account",
        };
      }
    }

    const role: AppRole = await resolveAppRole(email);
    const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn,
    });
    const jar = await cookies();
    jar.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
    jar.delete(DEV_SESSION_COOKIE);
    setLastActiveCookie(jar);
    return { ok: true, role, redirectTo: homePathForRole(role) };
  } catch {
    return {
      ok: false,
      error: "Could not start your session. Try again.",
      kind: "other",
    };
  }
}

/** Local-only sign-in when Firebase Admin credentials are not set. */
export async function createDevSession(formData: FormData): Promise<void> {
  if (firebaseAdminConfigured()) {
    redirect("/login?error=" + encodeURIComponent("Use Firebase sign-in."));
  }
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!email || !email.includes("@")) {
    redirect("/login?error=" + encodeURIComponent("Enter a valid email."));
  }
  const jar = await cookies();
  const role = await resolveAppRole(email);
  jar.set(
    DEV_SESSION_COOKIE,
    JSON.stringify({
      email,
      name: name || email,
      sub: `local:${email}`,
      role,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    },
  );
  setLastActiveCookie(jar);
  redirect(homePathForRole(role));
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  clearSessionCookies(jar);
  redirect("/login");
}

/** Client idle guard — clear session and send the user back to sign-in. */
export async function signOutDueToInactivity(): Promise<void> {
  const jar = await cookies();
  clearSessionCookies(jar);
  redirect(
    "/login?error=" + encodeURIComponent(IDLE_SIGNED_OUT_MESSAGE),
  );
}

/** Optional touch from the client when activity is detected. */
export async function touchSessionActivity(): Promise<{ ok: true }> {
  const jar = await cookies();
  const hasSession = Boolean(
    jar.get(SESSION_COOKIE)?.value || jar.get(DEV_SESSION_COOKIE)?.value,
  );
  if (!hasSession) return { ok: true };
  const raw = jar.get(LAST_ACTIVE_COOKIE)?.value;
  const last = Number(raw);
  if (Number.isFinite(last) && Date.now() - last > sessionIdleMs()) {
    clearSessionCookies(jar);
    return { ok: true };
  }
  setLastActiveCookie(jar);
  return { ok: true };
}
