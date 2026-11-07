"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase-admin";
import {
  DEV_SESSION_COOKIE,
  SESSION_COOKIE,
  homePathForRole,
} from "@/lib/auth";
import { firebaseAdminConfigured, isAdminEmail } from "@/lib/config";
import type { AppRole } from "@/lib/types";

const SESSION_DAYS = 14;

export async function createFirebaseSession(
  idToken: string,
): Promise<
  | { ok: true; role: AppRole; redirectTo: string }
  | { ok: false; error: string }
> {
  if (!firebaseAdminConfigured()) {
    return { ok: false, error: "Firebase Admin is not configured." };
  }
  const auth = adminAuth();
  if (!auth) return { ok: false, error: "Firebase Auth unavailable." };

  try {
    const decoded = await auth.verifyIdToken(idToken);
    const email = (decoded.email ?? "").trim().toLowerCase();
    if (!email) return { ok: false, error: "Signed-in account has no email." };

    const role: AppRole = isAdminEmail(email) ? "admin" : "member";
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
    return { ok: true, role, redirectTo: homePathForRole(role) };
  } catch {
    return { ok: false, error: "Could not create a session. Try again." };
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
  const role = isAdminEmail(email) ? "admin" : "member";
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
  redirect(homePathForRole(role));
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(DEV_SESSION_COOKIE);
  redirect("/login");
}
