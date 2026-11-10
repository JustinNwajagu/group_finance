"use client";

import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth, type PublicFirebaseConfig } from "@/lib/firebase-client";

function firebaseCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: string }).code;
  return typeof code === "string" ? code : null;
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Send a Firebase password-reset email. Uses a continue URL back to /login when
 * the current origin is authorized; otherwise falls back to a plain reset email.
 */
export async function sendPasswordResetWithFallback(
  config: PublicFirebaseConfig,
  email: string,
): Promise<void> {
  const auth = getFirebaseAuth(config);
  const origin = window.location.origin;
  const continueUrl = `${origin}/login`;

  if (!isLocalDevOrigin(origin)) {
    try {
      await sendPasswordResetEmail(auth, email, {
        url: continueUrl,
        handleCodeInApp: false,
      });
      return;
    } catch (err) {
      if (firebaseCode(err) !== "auth/unauthorized-continue-uri") throw err;
    }
  }

  await sendPasswordResetEmail(auth, email);
}

export { firebaseCode };
