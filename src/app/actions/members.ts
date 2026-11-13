"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit-log";
import { deleteMemberLogin } from "@/lib/access-requests";
import { isAdminEmail } from "@/lib/config";
import {
  formatTitledName,
  ROSTER_TITLES,
} from "@/lib/name-titles";
import { getExcoBoard } from "@/lib/store";
import {
  countPaymentsForMember,
  createMember,
  deleteMemberRow,
  getMemberById,
  listAllExpenses,
  updateMemberRow,
} from "@/lib/store";

function memberIsPrimaryAdmin(member: {
  email: string | null;
  login_email: string | null;
}): boolean {
  const emails = [member.login_email, member.email]
    .map((v) => (v || "").trim().toLowerCase())
    .filter(Boolean);
  return emails.some((email) => isAdminEmail(email));
}

export async function createMemberAction(formData: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!name) {
    redirect("/?error=" + encodeURIComponent("Name is required."));
  }

  const member = await createMember({
    name,
    email: email || null,
    phone: phone || null,
  });
  await recordAudit(viewer, {
    action: "member.create",
    summary: `Added member ${member.name}`,
    entityType: "member",
    entityId: member.id,
  });

  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/archive");
  revalidatePath("/access");
  redirect("/?ok=member");
}

/** Admin-only: change a roster member’s title and/or personal name. */
export async function updateMemberNameAction(
  formData: FormData,
): Promise<void> {
  const viewer = await requireAdmin();
  const id = Number(formData.get("member_id"));
  const title = String(formData.get("title") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!Number.isFinite(id) || id <= 0) {
    redirect("/?error=" + encodeURIComponent("Invalid member."));
  }
  if (name.length < 2) {
    redirect(
      `/members/${id}?error=` +
        encodeURIComponent("Enter the member’s personal name."),
    );
  }
  if (
    title &&
    !(ROSTER_TITLES as readonly string[]).includes(title) &&
    !/^[A-Za-z][A-Za-z .'-]{0,20}$/.test(title)
  ) {
    redirect(
      `/members/${id}?error=` + encodeURIComponent("Choose a valid title."),
    );
  }

  const member = await getMemberById(id);
  if (!member) {
    redirect("/?error=" + encodeURIComponent("Member not found."));
  }
  if (memberIsPrimaryAdmin(member)) {
    redirect(
      `/members/${id}?error=` +
        encodeURIComponent(
          "The primary admin member cannot be renamed here.",
        ),
    );
  }

  const nextName = formatTitledName(title, name);
  await updateMemberRow(id, { name: nextName });
  await recordAudit(viewer, {
    action: "member.update",
    summary: `Renamed member to ${nextName}`,
    entityType: "member",
    entityId: id,
  });

  revalidatePath("/");
  revalidatePath(`/members/${id}`);
  revalidatePath("/payments");
  revalidatePath("/dues");
  revalidatePath("/archive");
  revalidatePath("/access");
  revalidatePath("/expenses");
  redirect(`/members/${id}?ok=member_updated`);
}

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const viewer = await requireAdmin();
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
      const result = await deleteMemberLogin(id);
      if (result.memberRemoved) {
        await recordAudit(viewer, {
          action: "member.delete",
          summary: `Removed member ${member.name} (with login)`,
          entityType: "member",
          entityId: id,
        });
        revalidatePath("/");
        revalidatePath("/payments");
        revalidatePath("/archive");
        revalidatePath("/dues");
        revalidatePath("/expenses");
        revalidatePath("/access");
        revalidatePath("/members", "layout");
        redirect("/?ok=member_deleted");
      }
    } catch {
      // Continue with roster delete if login was already gone.
    }
  }

  await deleteMemberRow(id);
  await recordAudit(viewer, {
    action: "member.delete",
    summary: `Removed member ${member.name}`,
    entityType: "member",
    entityId: id,
  });

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
