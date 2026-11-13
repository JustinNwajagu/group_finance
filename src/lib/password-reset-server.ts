import "server-only";

import { sendTransactionalEmail } from "@/lib/admin-notify";
import { adminAuth } from "@/lib/firebase-admin";

function appLoginContinueUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!raw) return "";
  return `${raw.replace(/\/$/, "")}/login`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Ask Firebase Auth to email a password-reset link (same mailer as Forgot password).
 */
async function sendFirebasePasswordResetEmail(email: string): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Firebase API key is not configured.");
  }

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`;

  async function post(body: Record<string, unknown>): Promise<void> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        data.error?.message || `Password reset email failed (${response.status})`,
      );
    }
  }

  const baseBody = {
    requestType: "PASSWORD_RESET",
    email,
  } as const;

  const continueUrl = appLoginContinueUrl();
  if (continueUrl) {
    try {
      await post({
        ...baseBody,
        continueUrl,
        canHandleCodeInApp: false,
      });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (
        !/UNAUTHORIZED_CONTINUE_URI|INVALID_CONTINUE_URI/i.test(message)
      ) {
        throw err;
      }
    }
  }

  await post(baseBody);
}

async function generatePasswordResetLink(email: string): Promise<string> {
  const auth = adminAuth();
  if (!auth) {
    throw new Error("Auth is unavailable.");
  }
  const continueUrl = appLoginContinueUrl();
  if (continueUrl) {
    try {
      return await auth.generatePasswordResetLink(email, {
        url: continueUrl,
        handleCodeInApp: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (
        !/unauthorized-continue-uri|invalid-continue-uri/i.test(message)
      ) {
        throw err;
      }
    }
  }
  return auth.generatePasswordResetLink(email);
}

/**
 * Email a password reset to a member.
 * Prefers Firebase Auth’s built-in mailer; falls back to SMTP with a
 * generated link so admins still have a path when Auth email is blocked.
 */
export async function sendMemberPasswordResetEmail(email: string): Promise<{
  emailed: boolean;
  channel: "firebase" | "smtp" | "link_only";
  link?: string;
  error?: string;
}> {
  try {
    await sendFirebasePasswordResetEmail(email);
    return { emailed: true, channel: "firebase" };
  } catch (firebaseErr) {
    const firebaseError =
      firebaseErr instanceof Error
        ? firebaseErr.message
        : "Firebase could not send the reset email.";

    let link: string;
    try {
      link = await generatePasswordResetLink(email);
    } catch {
      return {
        emailed: false,
        channel: "link_only",
        error: firebaseError,
      };
    }

    const subject = "KLEF 13: reset your password";
    const text = [
      "An admin requested a password reset for your KLEF 13 login.",
      "",
      "Open this one-time link to choose a new password:",
      link,
      "",
      "If you did not expect this email, you can ignore it.",
    ].join("\n");
    const html = `
      <p>An admin requested a password reset for your KLEF 13 login.</p>
      <p><a href="${escapeHtml(link)}">Choose a new password</a></p>
      <p style="word-break:break-all;font-size:0.9em;color:#555">${escapeHtml(link)}</p>
      <p>If you did not expect this email, you can ignore it.</p>
    `.trim();

    const sent = await sendTransactionalEmail({
      to: [email],
      subject,
      text,
      html,
    });

    if (sent.channel === "smtp") {
      return { emailed: true, channel: "smtp", link };
    }

    return {
      emailed: false,
      channel: "link_only",
      link,
      error: sent.error || firebaseError,
    };
  }
}
