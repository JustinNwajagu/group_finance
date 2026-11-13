"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { isExcoOffice } from "@/lib/exco";
import { assignExcoOffice, getMemberById } from "@/lib/store";

export async function assignExcoOfficeAction(
  formData: FormData,
): Promise<void> {
  const viewer = await requireAdmin();
  const officeRaw = String(formData.get("office") ?? "").trim();
  const memberRaw = String(formData.get("member_id") ?? "").trim();

  if (!isExcoOffice(officeRaw)) {
    redirect("/access?error=" + encodeURIComponent("Invalid EXCO office."));
  }

  let member_id: number | null = null;
  let holder_name: string | null = null;
  if (memberRaw && memberRaw !== "none") {
    const id = Number(memberRaw);
    if (!Number.isFinite(id) || id <= 0) {
      redirect("/access?error=" + encodeURIComponent("Invalid member."));
    }
    const member = await getMemberById(id);
    if (!member) {
      redirect("/access?error=" + encodeURIComponent("Member not found."));
    }
    member_id = id;
    holder_name = member.name;
  }

  try {
    await assignExcoOffice({
      office: officeRaw,
      member_id,
      holder_name,
      updated_by: viewer.email,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not update EXCO position.";
    redirect("/access?error=" + encodeURIComponent(message));
  }

  revalidatePath("/access");
  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/members", "layout");
  redirect("/access?ok=exco_updated");
}
