import { connection } from "next/server";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { BrandLogo } from "@/components/brand-logo";
import { Flash } from "@/components/flash";
import { resolveViewer, homePathForRole } from "@/lib/auth";
import { adminEmail, firebaseClientConfig } from "@/lib/config";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const viewer = await resolveViewer();
  if (viewer && !viewer.simulated && viewer.access) {
    redirect(homePathForRole(viewer.access.role));
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const config = firebaseClientConfig();

  return (
    <div className="gate">
      <div className="gate-card">
        <BrandLogo size={80} priority />
        <p className="gate-brand">KLEF 13</p>
        <h1>Sign in</h1>
        <p className="gate-lede">Group financial records for Project SHSN_KLEF_2013</p>
        <Flash ok={undefined} error={error} messages={{}} />
        <LoginForm firebaseConfig={config} adminEmail={adminEmail()} />
      </div>
    </div>
  );
}
