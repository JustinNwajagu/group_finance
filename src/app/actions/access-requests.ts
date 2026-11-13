"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { isAdminEmail } from "@/lib/config";
import {
  createAccessRequest,
  deleteAccessRequest,
  deleteMemberLogin,
  emailHasAuthAccount,
  findPendingOrApprovedByEmail,
  getAccessRequestById,
  listAccessRequests,
  provisionApprovedUser,
  updateAccessRequest,
} from "@/lib/access-requests";
import {
  getMemberById,
  listMembersWithoutLogin,
} from "@/lib/store";
export type LoginFailureKind =
  | "wrong_password"
  | "no_account"
  | "pending"
  | "other";

export type UnlinkedMemberOption = {
  id: number;
  name: string;
  phone: string | null;
};

/** Public roster names still without a login — for the create-account picker. */
export async function listUnlinkedMembersForSignup(): Promise<
  UnlinkedMemberOption[]
> {
  const { compareMembersByName } = await import("@/lib/member-sort");
  const rows = await listMembersWithoutLogin();
  // Same alphabetical roster order as the home dashboard (titles ignored).
  return rows
    .map((m) => ({
      id: m.id,
      name: m.name,
      phone: m.phone?.trim() || null,
    }))
    .sort(compareMembersByName);
}

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

  const existing = await findPendingOrApprovedByEmail(normalized);
  if (existing?.status === "pending") {
    return {
      kind: "pending",
      message:
        "Your access request is waiting for admin approval. You cannot sign in yet.",
    };
  }

  const exists = await emailHasAuthAccount(normalized);
  if (exists) {
    return {
      kind: "wrong_password",
      message: "Wrong password. Try again, or use Forgot password.",
    };
  }

  if (existing?.status === "approved") {
    return {
      kind: "wrong_password",
      message:
        "Your account was approved. Sign in with your password, or use Forgot password.",
    };
  }

  return {
    kind: "no_account",
    message: "No account found for this email. You can request access below.",
  };
}

export async function submitAccessRequest(input: {
  email: string;
  password: string;
  /** "new" or a roster member id as string */
  memberChoice: string;
  title?: string;
  name?: string;
  phone?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { formatTitledName, isNameTitle } = await import("@/lib/name-titles");
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const choice = String(input.memberChoice ?? "").trim();

  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return {
      ok: false,
      error: "Choose a password with at least 8 characters.",
    };
  }
  if (!choice) {
    return {
      ok: false,
      error: "Select your name from the roster, or choose New member.",
    };
  }

  let title = "";
  let name = "";
  let phone = "";
  let claimedMemberId: number | null = null;

  if (choice === "new") {
    title = String(input.title ?? "").trim();
    name = String(input.name ?? "").trim();
    phone = String(input.phone ?? "").trim();
    if (!isNameTitle(title)) {
      return {
        ok: false,
        error: "Choose a title (Mr, Dr, Engr, Chief, or Sir).",
      };
    }
    if (name.length < 2) {
      return { ok: false, error: "Enter your full name." };
    }
    if (phone.length < 7) {
      return { ok: false, error: "Enter a valid phone number." };
    }
  } else {
    const memberId = Number(choice);
    if (!Number.isFinite(memberId) || memberId <= 0) {
      return { ok: false, error: "Select a valid roster member." };
    }
    const member = await getMemberById(memberId);
    if (!member || member.auth_uid || member.login_email) {
      return {
        ok: false,
        error:
          "That roster name is no longer available. Pick another name or New member.",
      };
    }
    const pendingClaim = (await listAccessRequests("pending")).some(
      (r) => r.claimed_member_id === memberId,
    );
    if (pendingClaim) {
      return {
        ok: false,
        error:
          "Someone already requested that roster name. Pick another name or New member.",
      };
    }
    claimedMemberId = memberId;
    name = member.name;
    const providedPhone = String(input.phone ?? "").trim();
    const rosterPhone = (member.phone || "").trim();
    // Prefer the phone they enter; fall back to whatever is already on the roster.
    phone = providedPhone || rosterPhone;
    if (!rosterPhone && providedPhone.length < 7) {
      return {
        ok: false,
        error: "Enter a valid phone number — none is on record for this member.",
      };
    }
    if (providedPhone && providedPhone.length < 7) {
      return { ok: false, error: "Enter a valid phone number." };
    }
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
        "This email was already approved. Sign in with your password, or use Forgot password.",
    };
  }

  const displayName =
    claimedMemberId != null ? name : formatTitledName(title, name);

  // Create Auth credentials now (password is never stored in Firestore).
  // App session still blocked until an admin approves.
  const { adminAuth } = await import("@/lib/firebase-admin");
  const auth = adminAuth();
  if (!auth) {
    return { ok: false, error: "Sign-up is unavailable right now." };
  }
  try {
    await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      return {
        ok: false,
        error: "An account already exists for this email. Try signing in.",
      };
    }
    if (code === "auth/invalid-password" || code === "auth/weak-password") {
      return {
        ok: false,
        error: "Choose a stronger password (at least 8 characters).",
      };
    }
    return { ok: false, error: "Could not create the account. Try again." };
  }

  let requestId = 0;
  try {
    const created = await createAccessRequest({
      email,
      title,
      name,
      phone,
      claimed_member_id: claimedMemberId,
    });
    requestId = created.id;
  } catch (err) {
    try {
      const user = await auth.getUserByEmail(email);
      await auth.deleteUser(user.uid);
    } catch {
      /* ignore cleanup failure */
    }
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not save your access request.",
    };
  }

  try {
    const { notifyAdminsOfAccessRequest } = await import("@/lib/admin-notify");
    const notify = await notifyAdminsOfAccessRequest({
      kind: "access_request",
      requestId,
      email,
      title,
      name,
      phone,
    });
    if (!notify.emailed && notify.error) {
      console.error("[access-request] admin email not sent:", notify.error);
    }
  } catch (err) {
    console.error("[access-request] admin notify failed:", err);
  }

  revalidatePath("/access");
  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/dues");
  revalidatePath("/expenses");
  revalidatePath("/archive");
  revalidatePath("/regulations");
  revalidatePath("/profile");
  return { ok: true };
}

export async function approveAccessRequest(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));

  if (!Number.isFinite(id)) {
    redirect("/access?error=" + encodeURIComponent("Invalid request."));
  }

  const request = await getAccessRequestById(id);
  if (!request || request.status !== "pending") {
    redirect("/access?error=" + encodeURIComponent("Request is not pending."));
  }

  const claimedId = request.claimed_member_id;
  const mode = claimedId != null ? "link" : "create";
  const memberId = claimedId ?? 0;

  if (mode === "link") {
    const member = await getMemberById(memberId);
    if (!member) {
      redirect(
        "/access?error=" +
          encodeURIComponent(
            "The claimed roster member was not found. Reject this request or ask them to request again.",
          ),
      );
    }
    if (member.auth_uid || member.login_email) {
      redirect(
        "/access?error=" +
          encodeURIComponent(
            "That roster member already has a login. Reject this request.",
          ),
      );
    }
  }

  let result: Awaited<ReturnType<typeof provisionApprovedUser>>;
  try {
    result = await provisionApprovedUser(
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
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not approve this request.";
    redirect("/access?error=" + encodeURIComponent(message));
  }

  revalidatePath("/access");
  revalidatePath("/");
  revalidatePath("/members");
  const q = new URLSearchParams();
  if (mode === "create") {
    q.set("ok", "member_created");
    q.set("name", result.member.name);
  } else {
    q.set("ok", "approved");
  }
  if (result.passwordResetLink) {
    q.set("link", result.passwordResetLink);
  }
  redirect(`/access?${q.toString()}`);
}

export async function rejectAccessRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;
  const request = await getAccessRequestById(id);

  // Remove unused Auth credentials created at request time.
  if (request?.email) {
    const { adminAuth } = await import("@/lib/firebase-admin");
    const auth = adminAuth();
    if (auth) {
      try {
        const user = await auth.getUserByEmail(request.email);
        await auth.deleteUser(user.uid);
      } catch {
        /* already removed */
      }
    }
  }

  // Do not keep rejection history.
  await deleteAccessRequest(id);

  revalidatePath("/access");
  redirect("/access?ok=rejected");
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

  let memberRemoved = false;
  try {
    const result = await deleteMemberLogin(memberId);
    memberRemoved = result.memberRemoved;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not delete login.";
    redirect("/access?error=" + encodeURIComponent(message));
  }

  revalidatePath("/access");
  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/dues");
  revalidatePath("/expenses");
  revalidatePath("/archive");
  revalidatePath("/members", "layout");
  redirect(
    memberRemoved
      ? "/access?ok=login_deleted_member_removed"
      : "/access?ok=login_deleted",
  );
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
  let link: string;
  try {
    link = await auth.generatePasswordResetLink(email);
  } catch {
    redirect(
      "/access?error=" +
        encodeURIComponent("Could not create a password reset link."),
    );
  }

  revalidatePath("/access");
  redirect("/access?ok=reset_sent&link=" + encodeURIComponent(link));
}

