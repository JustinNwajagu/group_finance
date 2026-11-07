import { connection } from "next/server";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Flash } from "@/components/flash";
import { resolveViewer } from "@/lib/auth";
import { adminEmail, firebaseClientConfig } from "@/lib/config";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewer = await resolveViewer();
  // Local default always resolves a simulated admin — only redirect when a
  // real Firebase session exists (not simulated).
  if (viewer && !viewer.simulated) redirect("/");

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const config = firebaseClientConfig();

  return (
    <div className="gate">
      <div className="gate-card" style={{ maxWidth: "26rem", width: "100%" }}>
        <div className="brand-mark">KLEF</div>
        <h1>Sign in</h1>
        <p>
          Group ledger for SHSN_KLEF_2013. Hosted on Firebase with email-based
          access.
        </p>
        <Flash ok={undefined} error={error} messages={{}} />
        <LoginForm firebaseConfig={config} adminEmail={adminEmail()} />
      </div>
    </div>
  );
}
