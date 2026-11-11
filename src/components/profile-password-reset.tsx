"use client";

import { useState, useTransition } from "react";
import {
  firebaseCode,
  sendPasswordResetWithFallback,
} from "@/lib/password-reset-client";
import type { PublicFirebaseConfig } from "@/lib/firebase-client";

export function ProfilePasswordReset({
  email,
  firebaseConfig,
}: {
  email: string;
  firebaseConfig: PublicFirebaseConfig | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!firebaseConfig) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Password reset is available when Firebase sign-in is configured.
      </p>
    );
  }

  function onRequest() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await sendPasswordResetWithFallback(firebaseConfig!, email);
        setNotice(
          `Password reset link sent to ${email}. Check your inbox and spam/junk folder.`,
        );
      } catch (err) {
        const code = firebaseCode(err);
        if (code === "auth/too-many-requests") {
          setError("Too many attempts. Wait a moment and try again.");
          return;
        }
        setError("Could not send a reset email. Try again shortly.");
      }
    });
  }

  return (
    <div className="stack" style={{ gap: "0.65rem" }}>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="form-ok" role="status">
          {notice}
        </p>
      ) : null}
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        aria-busy={pending}
        onClick={onRequest}
      >
        {pending ? (
          <>
            <span className="btn-spinner" aria-hidden />
            Sending…
          </>
        ) : (
          "Send password reset email"
        )}
      </button>
      <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
        We&apos;ll email a link to choose a new password for this login. The
        message often lands in spam until custom email sending is set up.
      </p>
    </div>
  );
}
