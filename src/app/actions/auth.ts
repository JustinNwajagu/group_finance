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
import {
  emailIsApproved,
  findPendingOrApprovedByEmail,
} from "@/lib/access-requests";
import type { AppRole } from "@/lib/types";

const SESSION_DAYS = 14;

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
