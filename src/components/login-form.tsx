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
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { createDevSession, createFirebaseSession } from "@/app/actions/auth";
import {
  classifyLoginFailure,
  listUnlinkedMembersForSignup,
  submitAccessRequest,
  type UnlinkedMemberOption,
} from "@/app/actions/access-requests";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { PasswordInput } from "@/components/password-input";
import { ScrollSelect } from "@/components/scroll-select";
import { getFirebaseAuth, type PublicFirebaseConfig } from "@/lib/firebase-client";
import { NAME_TITLES } from "@/lib/name-titles";

const WRONG_CREDENTIALS_MESSAGE =
  "Incorrect email or password. Check your details and try again.";

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
 * Prefer a continue URL back to /login when the current origin is allowed in
 * Firebase Auth → Authorized domains. Local preview (127.0.0.1) and other
 * unauthorized hosts fall back to a plain reset email so the flow still works.
 */
async function sendPasswordResetWithFallback(
  auth: ReturnType<typeof getFirebaseAuth>,
  email: string,
): Promise<void> {
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
      // Domain not on the Auth allow-list yet — still send the reset mail.
    }
  }

  await sendPasswordResetEmail(auth, email);
}

export function LoginForm({
  firebaseConfig,
  adminEmail,
  unlinkedMembers,
}: {
  firebaseConfig: PublicFirebaseConfig | null;
  adminEmail: string;
  unlinkedMembers: UnlinkedMemberOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const pending = signingIn;

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

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signingIn) return;
    setError(null);
    setRequestNotice(null);
    const email = emailInputRef.current?.value.trim() ?? "";
    const password = passwordInputRef.current?.value ?? "";
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSigningIn(true);
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
          if (classified.kind === "wrong_password") {
            setError(WRONG_CREDENTIALS_MESSAGE);
          } else {
            setError(classified.message);
          }
          if (classified.kind === "no_account") {
            openRequestFor(email);
          }
        } catch {
          setError(WRONG_CREDENTIALS_MESSAGE);
        }
        return;
      }
      if (code === "auth/too-many-requests") {
        setError("Too many attempts. Wait a moment and try again.");
        return;
      }
      if (
        code === "auth/api-key-not-valid" ||
        code === "auth/invalid-api-key"
      ) {
        setError(
          "Sign-in is misconfigured (invalid Firebase API key). Update the NEXT_PUBLIC_FIREBASE_API_KEY secret in App Hosting and redeploy.",
        );
        return;
      }
      const detail = code ? ` (${code})` : "";
      setError(`Sign-in failed${detail}. Check your details and try again.`);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="login-stack">
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
        <div className="field">
          <div className="field-label-row">
            <label htmlFor="login-password">Password</label>
            <button
              type="button"
              className="text-link"
              disabled={pending}
              onClick={() => {
                setError(null);
                setRequestNotice(null);
                setResetEmail(emailInputRef.current?.value?.trim() ?? "");
                setResetOpen(true);
              }}
            >
              Forgot password?
            </button>
          </div>
          <PasswordInput
            id="login-password"
            inputRef={passwordInputRef}
            name="password"
            required
            autoComplete="current-password"
            disabled={pending}
          />
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <>
              <span className="btn-spinner" aria-hidden />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="login-foot">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          className="text-link"
          disabled={pending}
          onClick={() =>
            openRequestFor(emailInputRef.current?.value?.trim() ?? "")
          }
        >
          Create an account
        </button>
      </p>

      <ForgotPasswordDialog
        open={resetOpen}
        defaultEmail={resetEmail}
        firebaseConfig={firebaseConfig}
        onClose={() => setResetOpen(false)}
        onSent={(email) => {
          setResetOpen(false);
          setError(null);
          setRequestNotice(
            `Password reset link sent to ${email}. Check your inbox and spam/junk folder.`,
          );
        }}
        onNoAccount={(email) => {
          setResetOpen(false);
          setError("No account found for this email. You can create an account.");
          openRequestFor(email);
        }}
      />

      <AccessRequestDialog
        open={requestOpen}
        defaultEmail={requestEmail}
        unlinkedMembers={unlinkedMembers}
        onClose={() => setRequestOpen(false)}
        onSubmitted={() => {
          setRequestOpen(false);
          setError(null);
          setRequestNotice(
            "Request sent. You will gain access after an admin grants it.",
          );
        }}
      />
    </div>
  );
}

function ForgotPasswordDialog({
  open,
  defaultEmail,
  firebaseConfig,
  onClose,
  onSent,
  onNoAccount,
}: {
  open: boolean;
  defaultEmail: string;
  firebaseConfig: PublicFirebaseConfig;
  onClose: () => void;
  onSent: (email: string) => void;
  onNoAccount: (email: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [openSynced, setOpenSynced] = useState(open);
  const [pending, startTransition] = useTransition();

  if (open !== openSynced) {
    setOpenSynced(open);
    if (open) {
      setError(null);
      setEmail(defaultEmail);
    }
  }

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    startTransition(async () => {
      try {
        const auth = getFirebaseAuth(firebaseConfig);
        await sendPasswordResetWithFallback(auth, trimmed);
        onSent(trimmed);
      } catch (err) {
        const code = firebaseCode(err);
        if (code === "auth/invalid-email") {
          setError("Enter a valid email address.");
          return;
        }
        if (code === "auth/user-not-found") {
          onNoAccount(trimmed);
          return;
        }
        if (code === "auth/too-many-requests") {
          setError("Too many attempts. Wait a moment and try again.");
          return;
        }
        setError("Could not send a reset email. Try again shortly.");
      }
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
          <h3 id={titleId}>Reset password</h3>
          <DialogCloseButton onClick={onClose} disabled={pending} />
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Enter the email for your account. We&apos;ll send a link to choose a
          new password.
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
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            autoFocus
          />
        </label>
        <div className="contrib-dialog-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? (
              <>
                <span className="btn-spinner" aria-hidden />
                Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function AccessRequestDialog({
  open,
  defaultEmail,
  unlinkedMembers,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  defaultEmail: string;
  unlinkedMembers: UnlinkedMemberOption[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [errorForOpen, setErrorForOpen] = useState(open);
  const [memberChoice, setMemberChoice] = useState("");
  const [phone, setPhone] = useState("");
  const [roster, setRoster] = useState(unlinkedMembers);
  const [pending, startTransition] = useTransition();
  const isNewMember = memberChoice === "new";
  const claimedSelected = Boolean(memberChoice) && !isNewMember;
  const selectedMember = claimedSelected
    ? roster.find((m) => String(m.id) === memberChoice)
    : null;
  const claimHasPhoneOnRecord = Boolean(selectedMember?.phone?.trim());
  const phoneRequired = isNewMember || (claimedSelected && !claimHasPhoneOnRecord);

  if (open !== errorForOpen) {
    setErrorForOpen(open);
    if (open) {
      setError(null);
      setMemberChoice("");
      setPhone("");
      setRoster(unlinkedMembers);
    }
  }

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
      let cancelled = false;
      void listUnlinkedMembersForSignup()
        .then((fresh) => {
          if (!cancelled) setRoster(fresh);
        })
        .catch(() => {
          /* keep server-provided list */
        });
      return () => {
        cancelled = true;
      };
    }
    if (el.open) el.close();
    return undefined;
  }, [open]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!memberChoice) {
      setError("Select your name from the roster, or choose New member.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await submitAccessRequest({
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
        memberChoice,
        title: String(data.get("title") ?? ""),
        name: String(data.get("name") ?? ""),
        phone: String(data.get("phone") ?? ""),
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
      className="contrib-dialog contrib-dialog-wide"
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
          <h3 id={titleId}>Create an account</h3>
          <DialogCloseButton onClick={onClose} disabled={pending} />
        </div>
        <p className="muted signup-choice-hint">
          Find your name on the roster if you are already a member. If not,
          choose New member. An admin must grant access before you can sign in.
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="field">
          Your name on the roster
          <ScrollSelect
            name="member_choice"
            required
            value={memberChoice}
            placeholder="Choose…"
            disabled={pending}
            onChange={(next) => {
              setMemberChoice(next);
              if (next === "new" || !next) {
                setPhone("");
                return;
              }
              const match = roster.find((m) => String(m.id) === next);
              setPhone(match?.phone ?? "");
            }}
            options={[
              { value: "", label: "Choose…", disabled: true },
              {
                value: "new",
                label: "New member — not on the roster yet",
              },
              ...roster.map((m) => ({
                value: String(m.id),
                label: m.name,
              })),
            ]}
          />
        </label>
        {isNewMember ? (
          <div className="form-grid two">
            <label className="field">
              Title
              <ScrollSelect
                name="title"
                required
                defaultValue=""
                placeholder="Choose…"
                disabled={pending}
                options={[
                  { value: "", label: "Choose…", disabled: true },
                  ...NAME_TITLES.map((title) => ({
                    value: title,
                    label: title,
                  })),
                ]}
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
          </div>
        ) : null}
        {isNewMember || claimedSelected ? (
          <label className="field">
            Phone number
            {claimedSelected && claimHasPhoneOnRecord ? " (optional)" : ""}
            <input
              name="phone"
              type="tel"
              required={phoneRequired}
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={
                claimedSelected && !claimHasPhoneOnRecord
                  ? "Add your phone number"
                  : undefined
              }
              disabled={pending}
            />
          </label>
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
          <button
            type="submit"
            className="btn-primary"
            disabled={pending || !memberChoice}
            aria-busy={pending}
          >
            {pending ? (
              <>
                <span className="btn-spinner" aria-hidden />
                Sending…
              </>
            ) : (
              "Submit request"
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
