import { connection } from "next/server";
import { redirect } from "next/navigation";
import { resolveViewer } from "@/lib/auth";

export const instant = false;

/** Pending role is unused with Firebase single-admin rule — bounce home. */
export default async function PendingPage() {
  await connection();
  const viewer = await resolveViewer();
  if (!viewer) redirect("/login");
  redirect("/");
}
