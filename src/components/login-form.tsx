"use client";

import { useState, useTransition } from "react";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { createDevSession, createFirebaseSession } from "@/app/actions/auth";
import { getFirebaseAuth, type PublicFirebaseConfig } from "@/lib/firebase-client";

export function LoginForm({
  firebaseConfig,
  adminEmail,
}: {
  firebaseConfig: PublicFirebaseConfig | null;
  adminEmail: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!firebaseConfig) {
    return (
      <form action={createDevSession} className="form-grid">
        <label className="field">
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={adminEmail}
            autoComplete="username"
          />
        </label>
        <label className="field">
          Name (optional)
          <input name="name" autoComplete="name" />
        </label>
        <button type="submit" className="btn-primary">
          Continue
        </button>
      </form>
    );
  }

  async function finish(idToken: string) {
    const result = await createFirebaseSession(idToken);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.href = result.redirectTo;
  }

  function onEmailLogin(formData: FormData) {
    setError(null);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    startTransition(async () => {
      try {
        const auth = getFirebaseAuth(firebaseConfig!);
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await finish(await cred.user.getIdToken());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    });
  }

  function onGoogle() {
    setError(null);
    startTransition(async () => {
      try {
        const auth = getFirebaseAuth(firebaseConfig!);
        const cred = await signInWithPopup(auth, new GoogleAuthProvider());
        await finish(await cred.user.getIdToken());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed.");
      }
    });
  }

  return (
    <div className="form-grid">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <form action={onEmailLogin} className="form-grid">
        <label className="field">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            disabled={pending}
          />
        </label>
        <label className="field">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={pending}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button
        type="button"
        className="btn-ghost"
        onClick={onGoogle}
        disabled={pending}
      >
        Continue with Google
      </button>
    </div>
  );
}
