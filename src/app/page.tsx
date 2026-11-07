import { redirect } from "next/navigation";
import { resolveViewer } from "@/lib/auth";

export const instant = false;

export default async function HomePage() {
  const viewer = await resolveViewer();
  if (!viewer) redirect("/signed-out");
  if (!viewer.access || viewer.access.role === "pending") redirect("/pending");
  redirect("/members");
}
