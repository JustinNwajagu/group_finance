import { connection } from "next/server";
import { redirect } from "next/navigation";

export const instant = false;

/** Former members dash — roster now lives on Home. */
export default async function MembersIndexRedirect({
  searchParams,
}: PageProps<"/members">) {
  await connection();
  const params = await searchParams;
  const q = new URLSearchParams();
  for (const key of ["q", "ok", "error"] as const) {
    const value = params[key];
    if (typeof value === "string" && value) q.set(key, value);
  }
  const suffix = q.toString();
  redirect(suffix ? `/?${suffix}` : "/");
}
