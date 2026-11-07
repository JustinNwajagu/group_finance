import { connection } from "next/server";
import { redirect } from "next/navigation";
import { resolveViewer } from "@/lib/auth";

export const instant = false;

export default async function PendingPage() {
  await connection();
  const viewer = await resolveViewer();
  if (!viewer) redirect("/signed-out");
  if (viewer.access && viewer.access.role !== "pending") {
    redirect("/members");
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="brand-mark">KLEF</div>
        <h1>Waiting for access</h1>
        <p>
          Signed in as <strong>{viewer.email}</strong>. An admin still needs to
          grant you a role before you can browse members and payments.
        </p>
      </div>
    </div>
  );
}
