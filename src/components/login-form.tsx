"use client";

import {
  FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { createDevSession, createFirebaseSession } from "@/app/actions/auth";
import {
  classifyLoginFailure,
  submitAccessRequest,
} from "@/app/actions/access-requests";
import { PasswordInput } from "@/components/password-input";
import { getFirebaseAuth, type PublicFirebaseConfig } from "@/lib/firebase-client";

function firebaseCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: string }).code;
  return typeof code === "string" ? code : null;
}

export function LoginForm({
  firebaseConfig,
  adminEmail,
}: {
  firebaseConfig: PublicFirebaseConfig | null;
  adminEmail: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

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

  async function finish(idToken: string, fallbackEmail: string) {
    const result = await createFirebaseSession(idToken);
    if (!result.ok) {
      setError(result.error);
      if (result.kind === "no_account") {
        setRequestEmail(fallbackEmail);
        setRequestOpen(true);
      }
      return;
    }
    window.location.href = result.redirectTo;
  }

  function openRequestFor(email: string) {
    setRequestEmail(email.trim().toLowerCase());
    setRequestOpen(true);
  }

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRequestNotice(null);
    const email = emailInputRef.current?.value.trim() ?? "";
    const password = passwordInputRef.current?.value ?? "";
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    startTransition(async () => {
      try {
        const auth = getFirebaseAuth(firebaseConfig!);
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await finish(await cred.user.getIdToken(), email);
      } catch (err) {
        const code = firebaseCode(err);
        if (
          code === "auth/invalid-credential" ||
          code === "auth/user-not-found" ||
          code === "auth/wrong-password" ||
          code === "auth/invalid-email" ||
          code === "auth/invalid-login-credentials" ||
          !code
        ) {
          try {
            const classified = await classifyLoginFailure(email);
            setError(classified.message);
            if (classified.kind === "no_account") {
              openRequestFor(email);
            }
          } catch {
            setError("No account found for this email. You can request access.");
            openRequestFor(email);
          }
          return;
        }
        if (code === "auth/too-many-requests") {
          setError("Too many attempts. Wait a moment and try again.");
          return;
        }
        setError("Sign-in failed. Check your details and try again.");
      }
    });
  }

  function onForgotPassword() {
    setError(null);
    setRequestNotice(null);
    const email = emailInputRef.current?.value.trim() ?? "";
    if (!email || !email.includes("@")) {
      setError("Enter your email address first, then choose Forgot password.");
      return;
    }
    startTransition(async () => {
      try {
        const auth = getFirebaseAuth(firebaseConfig!);
        await sendPasswordResetEmail(auth, email);
        setRequestNotice(
          "If an account exists for that email, a password reset link has been sent.",
        );
      } catch (err) {
        const code = firebaseCode(err);
        if (code === "auth/invalid-email") {
          setError("Enter a valid email address.");
          return;
        }
        if (code === "auth/user-not-found") {
          setError("No account found for this email. You can request access.");
          openRequestFor(email);
          return;
        }
        setError("Could not send a reset email. Try again shortly.");
      }
    });
  }

  function onGoogle() {
    setError(null);
    setRequestNotice(null);
    startTransition(async () => {
      try {
        const auth = getFirebaseAuth(firebaseConfig!);
        const cred = await signInWithPopup(auth, new GoogleAuthProvider());
        const email = cred.user.email ?? "";
        await finish(await cred.user.getIdToken(), email);
      } catch (err) {
        const code = firebaseCode(err);
        if (code === "auth/popup-closed-by-user") {
          setError("Google sign-in was cancelled.");
          return;
        }
        setError("Google sign-in failed. Try again.");
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
      {requestNotice ? (
        <p className="form-ok" role="status">
          {requestNotice}
        </p>
      ) : null}
      <form onSubmit={handleEmailSubmit} className="form-grid">
        <label className="field">
          Email
          <input
            ref={emailInputRef}
            name="email"
            type="email"
            required
            autoComplete="username"
            disabled={pending}
          />
        </label>
        <label className="field">
          Password
          <PasswordInput
            inputRef={passwordInputRef}
            name="password"
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
        onClick={onForgotPassword}
        disabled={pending}
      >
        Forgot password
      </button>
      <button
        type="button"
        className="btn-ghost"
        onClick={onGoogle}
        disabled={pending}
      >
        Continue with Google
      </button>
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        onClick={() =>
          openRequestFor(emailInputRef.current?.value?.trim() ?? "")
        }
      >
        Request an account
      </button>

      <AccessRequestDialog
        open={requestOpen}
        defaultEmail={requestEmail}
        onClose={() => setRequestOpen(false)}
        onSubmitted={() => {
          setRequestOpen(false);
          setError(null);
          setRequestNotice(
            "Request sent. An admin must approve it before you can sign in.",
          );
        }}
      />
    </div>
  );
}

function AccessRequestDialog({
  open,
  defaultEmail,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  defaultEmail: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setError(null);
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await submitAccessRequest({
        email: String(data.get("email") ?? ""),
        name: String(data.get("name") ?? ""),
        phone: String(data.get("phone") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSubmitted();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="contrib-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <form onSubmit={onSubmit} className="contrib-dialog-panel">
        <div className="contrib-dialog-head">
          <h3 id={titleId}>Request an account</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Choose your password now. An admin must still approve and link you to
          a member before you can sign in.
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="field">
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={defaultEmail}
            key={defaultEmail}
            autoComplete="email"
            disabled={pending}
          />
        </label>
        <label className="field">
          Full name
          <input
            name="name"
            required
            autoComplete="name"
            disabled={pending}
          />
        </label>
        <label className="field">
          Phone number
          <input
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            disabled={pending}
          />
        </label>
        <label className="field">
          Password
          <PasswordInput
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            disabled={pending}
          />
        </label>
        <div className="contrib-dialog-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Sending…" : "Submit request"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
