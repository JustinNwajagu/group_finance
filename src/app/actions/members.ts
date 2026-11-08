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

/** @deprecated use createMemberAction — kept for existing form imports */
export { createMemberAction as createMember };
