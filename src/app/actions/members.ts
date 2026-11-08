"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createMember } from "@/lib/store";

export async function createMemberAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) {
    redirect("/?error=" + encodeURIComponent("Name is required."));
  }

  await createMember({
    name,
    email: email || null,
    phone: phone || null,
  });

  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/archive");
  revalidatePath("/access");
  redirect("/?ok=member");
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
      "/?error=" +
        encodeURIComponent(
          "Paste one member per line: Name, optional email, optional phone.",
        ),
    );
  }

  let imported = 0;
  for (const line of lines) {
    if (/^name\s*,/i.test(line)) continue;
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const name = parts[0] ?? "";
    const email = parts[1] ?? "";
    const phone = parts[2] ?? "";
    if (!name) continue;
    await createMember({
      name,
      email: email || null,
      phone: phone || null,
    });
    imported += 1;
  }

  if (imported === 0) {
    redirect("/?error=" + encodeURIComponent("No members found to import."));
  }

  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/archive");
  revalidatePath("/access");
  redirect("/?ok=import");
}

/** @deprecated use createMemberAction — kept for existing form imports */
export { createMemberAction as createMember };
