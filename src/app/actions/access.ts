"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { AppRole } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function inviteUser(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "member").trim() as AppRole;

  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (role !== "admin" && role !== "member") {
    return { ok: false, error: "Role must be admin or member." };
  }

  const existing = await sql<{ id: number; role: string }>(
    "select id, role from app_users where lower(email) = lower($1) limit 1",
    [email],
  );
  if (existing[0]) {
    if (existing[0].role === "pending") {
      await sql(
        "update app_users set role = $1, name = case when $2 = '' then name else $2 end where id = $3",
        [role, name, existing[0].id],
      );
      revalidatePath("/access");
      return { ok: true };
    }
    return { ok: false, error: "That email already has access." };
  }

  await sql(
    `insert into app_users (cursor_sub, email, name, role)
     values (null, $1, $2, $3)`,
    [email, name, role],
  );
  revalidatePath("/access");
  return { ok: true };
}

export async function setUserRole(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const id = Number(formData.get("id"));
  const role = String(formData.get("role") ?? "").trim() as AppRole;

  if (!Number.isFinite(id)) return { ok: false, error: "Invalid user." };
  if (role !== "admin" && role !== "member" && role !== "pending") {
    return { ok: false, error: "Invalid role." };
  }
  if (id === viewer.access.id && role !== "admin") {
    return { ok: false, error: "You cannot remove your own admin role." };
  }

  if (role !== "admin") {
    const admins = await sql<{ count: string }>(
      "select count(*)::text as count from app_users where role = 'admin' and id <> $1",
      [id],
    );
    if (Number(admins[0]?.count ?? 0) === 0) {
      return { ok: false, error: "Keep at least one admin." };
    }
  }

  await sql("update app_users set role = $1 where id = $2", [role, id]);
  revalidatePath("/access");
  return { ok: true };
}
