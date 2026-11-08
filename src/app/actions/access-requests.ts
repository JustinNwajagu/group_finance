"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, isAdmin } from "@/lib/auth";
import { isAdminEmail } from "@/lib/config";
import {
  createAccessRequest,
  emailHasAuthAccount,
  findPendingOrApprovedByEmail,
  getAccessRequestById,
  listAccessRequests,
  provisionApprovedUser,
  updateAccessRequestStatus,
} from "@/lib/access-requests";

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
      error: "This email was already approved. Check your inbox to set a password.",
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
  if (!Number.isFinite(id)) return;

  const request = await getAccessRequestById(id);
  if (!request || request.status !== "pending") return;

  await updateAccessRequestStatus(id, "approved");
  const { passwordResetLink } = await provisionApprovedUser(request);

  revalidatePath("/access");
  revalidatePath("/");
  if (passwordResetLink) {
    redirect(
      "/access?ok=approved&link=" + encodeURIComponent(passwordResetLink),
    );
  }
  redirect("/access?ok=approved");
}

export async function rejectAccessRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  await updateAccessRequestStatus(id, "rejected");
  revalidatePath("/access");
  redirect("/access?ok=rejected");
}

export async function loadPendingAccessRequests() {
  const viewer = await requireAdmin();
  if (!isAdmin(viewer)) return [];
  return listAccessRequests("pending");
}
