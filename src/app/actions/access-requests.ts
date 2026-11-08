"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, isAdmin } from "@/lib/auth";
import { isAdminEmail } from "@/lib/config";
import {
  createAccessRequest,
  deleteMemberLogin,
  emailHasAuthAccount,
  findPendingOrApprovedByEmail,
  getAccessRequestById,
  listAccessRequests,
  loginCapacity,
  provisionApprovedUser,
  updateAccessRequest,
} from "@/lib/access-requests";
import { getMemberById } from "@/lib/store";

export type LoginFailureKind =
  | "wrong_password"
  | "no_account"
  | "pending"
  | "other";

export async function classifyLoginFailure(
  email: string,
): Promise<{ kind: LoginFailureKind; message: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return { kind: "other", message: "Enter a valid email address." };
  }

  if (isAdminEmail(normalized)) {
    const exists = await emailHasAuthAccount(normalized);
    if (exists) {
      return {
        kind: "wrong_password",
        message: "Wrong password. Try again, or reset your password.",
      };
    }
    return {
      kind: "no_account",
      message: "No account found for this email.",
    };
  }

  const exists = await emailHasAuthAccount(normalized);
  if (exists) {
    return {
      kind: "wrong_password",
      message: "Wrong password. Try again, or reset your password.",
    };
  }

  const existing = await findPendingOrApprovedByEmail(normalized);
  if (existing?.status === "pending") {
    return {
      kind: "pending",
      message:
        "Your access request is waiting for admin approval. You cannot sign in yet.",
    };
  }
  if (existing?.status === "approved") {
    return {
      kind: "wrong_password",
      message:
        "Your account was approved. Use the password setup link from your admin, or reset your password.",
    };
  }

  return {
    kind: "no_account",
    message: "No account found for this email. You can request access below.",
  };
}

export async function submitAccessRequest(input: {
  email: string;
  name: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone.trim();

  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (name.length < 2) {
    return { ok: false, error: "Enter your full name." };
  }
  if (phone.length < 7) {
    return { ok: false, error: "Enter a valid phone number." };
  }

  if (await emailHasAuthAccount(email)) {
    return {
      ok: false,
      error: "An account already exists for this email. Try signing in.",
    };
  }

  const existing = await findPendingOrApprovedByEmail(email);
  if (existing?.status === "pending") {
    return {
      ok: false,
      error: "You already have a pending request. An admin will review it.",
    };
  }
  if (existing?.status === "approved") {
    return {
      ok: false,
      error:
        "This email was already approved. Check with your admin for the password link.",
    };
  }

  await createAccessRequest({ email, name, phone });
  revalidatePath("/access");
  return { ok: true };
}

export async function approveAccessRequest(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const mode = String(formData.get("link_mode") ?? "").trim();
  const memberId = Number(formData.get("member_id"));

  if (!Number.isFinite(id)) {
    redirect("/access?error=" + encodeURIComponent("Invalid request."));
  }

  const request = await getAccessRequestById(id);
  if (!request || request.status !== "pending") {
    redirect("/access?error=" + encodeURIComponent("Request is not pending."));
  }

  if (mode !== "link" && mode !== "create") {
    redirect(
      "/access?error=" +
        encodeURIComponent("Choose link to a member or create a new member."),
    );
  }

  try {
    const result = await provisionApprovedUser(
      request,
      mode === "link"
        ? { mode: "link", memberId }
        : { mode: "create" },
    );

    await updateAccessRequest(id, {
      status: "approved",
      decided_at: new Date().toISOString(),
      member_id: result.member.id,
    });

    revalidatePath("/access");
    revalidatePath("/");
    if (result.passwordResetLink) {
      redirect(
        "/access?ok=approved&link=" +
          encodeURIComponent(result.passwordResetLink),
      );
    }
    redirect("/access?ok=approved");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not approve this request.";
    redirect("/access?error=" + encodeURIComponent(message));
  }
}

export async function rejectAccessRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await updateAccessRequest(id, {
    status: "rejected",
    decided_at: new Date().toISOString(),
  });
  revalidatePath("/access");
  redirect("/access?ok=rejected");
}

export async function loadPendingAccessRequests() {
  const viewer = await requireAdmin();
  if (!isAdmin(viewer)) return [];
  return listAccessRequests("pending");
}

export async function getLoginCapacityAction() {
  await requireAdmin();
  return loginCapacity();
}

export async function deleteLoginAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const memberId = Number(formData.get("member_id"));
  if (!Number.isFinite(memberId) || memberId <= 0) {
    redirect("/access?error=" + encodeURIComponent("Invalid member."));
  }

  const member = await getMemberById(memberId);
  if (!member) {
    redirect("/access?error=" + encodeURIComponent("Member not found."));
  }
  const loginEmail = (member.login_email || member.email || "").toLowerCase();
  if (loginEmail && isAdminEmail(loginEmail)) {
    redirect(
      "/access?error=" +
        encodeURIComponent("The admin login cannot be deleted here."),
    );
  }

  try {
    await deleteMemberLogin(memberId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not delete login.";
    redirect("/access?error=" + encodeURIComponent(message));
  }

  revalidatePath("/access");
  revalidatePath("/");
  redirect("/access?ok=login_deleted");
}

/** Admin-triggered password reset link for a member login. */
export async function sendMemberPasswordReset(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const memberId = Number(formData.get("member_id"));
  const member = await getMemberById(memberId);
  const email = (member?.login_email || member?.email || "").trim().toLowerCase();
  if (!email) {
    redirect(
      "/access?error=" + encodeURIComponent("This member has no login email."),
    );
  }

  const { adminAuth } = await import("@/lib/firebase-admin");
  const auth = adminAuth();
  if (!auth) {
    redirect("/access?error=" + encodeURIComponent("Auth is unavailable."));
  }
  try {
    const link = await auth.generatePasswordResetLink(email);
    revalidatePath("/access");
    redirect("/access?ok=reset_sent&link=" + encodeURIComponent(link));
  } catch {
    redirect(
      "/access?error=" +
        encodeURIComponent("Could not create a password reset link."),
    );
  }
}
