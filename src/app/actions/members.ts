"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { deleteMemberLogin } from "@/lib/access-requests";
import { getExcoBoard } from "@/lib/store";
import {
  countPaymentsForMember,
  createMember,
  deleteMemberRow,
  getMemberById,
  listAllExpenses,
} from "@/lib/store";

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

export async function deleteMemberAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("member_id"));
  if (!Number.isFinite(id) || id <= 0) {
    redirect("/?error=" + encodeURIComponent("Invalid member."));
  }

  const member = await getMemberById(id);
  if (!member) {
    redirect("/?error=" + encodeURIComponent("Member not found."));
  }

  const payments = await countPaymentsForMember(id);
  if (payments.total > 0) {
    redirect(
      `/members/${id}?error=` +
        encodeURIComponent(
          "This member has contribution or dues payments and cannot be deleted.",
        ),
    );
  }

  const expenseHit = (await listAllExpenses()).some((expense) =>
    expense.allocations.some((row) => row.member_id === id),
  );
  if (expenseHit) {
    redirect(
      `/members/${id}?error=` +
        encodeURIComponent(
          "This member is named on an expense and cannot be deleted.",
        ),
    );
  }

  const exco = await getExcoBoard();
  if (exco.seats.some((seat) => seat.member_id === id)) {
    redirect(
      `/members/${id}?error=` +
        encodeURIComponent(
          "This member holds an EXCO office. Reassign the office first.",
        ),
    );
  }

  if (member.auth_uid || member.login_email) {
    try {
      await deleteMemberLogin(id);
    } catch {
      // Continue with roster delete if login was already gone.
    }
  }

  await deleteMemberRow(id);

  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/archive");
  revalidatePath("/dues");
  revalidatePath("/expenses");
  revalidatePath("/access");
  revalidatePath("/members", "layout");
  redirect("/?ok=member_deleted");
}

/** @deprecated use createMemberAction — kept for existing form imports */
export { createMemberAction as createMember };
