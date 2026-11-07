"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function createMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!name) {
    redirect("/members?error=" + encodeURIComponent("Name is required."));
  }

  await sql(`insert into members (name, email) values ($1, $2)`, [
    name,
    email || null,
  ]);

  revalidatePath("/members");
  revalidatePath("/payments");
  redirect("/members?ok=member");
}

export async function importMembers(formData: FormData): Promise<void> {
  await requireAdmin();
  const raw = String(formData.get("csv") ?? "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    redirect(
      "/members?error=" +
        encodeURIComponent("Paste one member per line: Name, optional email."),
    );
  }

  let imported = 0;
  for (const line of lines) {
    if (/^name\s*,/i.test(line)) continue;
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const name = parts[0] ?? "";
    const email = parts[1] ?? "";
    if (!name) continue;
    await sql(`insert into members (name, email) values ($1, $2)`, [
      name,
      email || null,
    ]);
    imported += 1;
  }

  if (imported === 0) {
    redirect(
      "/members?error=" + encodeURIComponent("No members found to import."),
    );
  }

  revalidatePath("/members");
  revalidatePath("/payments");
  redirect("/members?ok=import");
}
