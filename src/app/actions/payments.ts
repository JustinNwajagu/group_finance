"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listMemberOptions } from "@/lib/data";
import { getContributionRemaining } from "@/lib/expenses-data";
import {
  createPaymentRequestRow,
  createPaymentRow,
  deletePaymentRow,
  findPaymentForMemberRequest,
  getPaymentById,
  getPaymentRequestById,
  getMemberById,
  updatePaymentRequestRow,
  updatePaymentRow,
} from "@/lib/store";

function failPayments(msg: string): never {
  redirect("/payments?error=" + encodeURIComponent(msg));
}

function failReturn(returnTo: string, msg: string): never {
  const base = returnTo.startsWith("/") ? returnTo.split("?")[0] : "/payments";
  redirect(`${base}?error=${encodeURIComponent(msg)}`);
}

function okReturn(returnTo: string, ok: string): never {
  const base = returnTo.startsWith("/") ? returnTo.split("?")[0] : "/payments";
  redirect(`${base}?ok=${ok}`);
}

function revalidateDashboards(...extra: string[]) {
  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/archive");
  revalidatePath("/members");
  revalidatePath("/expenses");
  for (const path of extra) revalidatePath(path);
}

export async function createPaymentRequest(formData: FormData): Promise<void> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const amount = Number(amountRaw);

  if (!title) failPayments("Title is required.");
  if (!Number.isFinite(amount) || amount < 0) failPayments("Enter a valid amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    failPayments("Choose a payment deadline.");
  }

  const members = await listMemberOptions();
  if (members.length === 0) {
    failPayments("Add a member first, then create a payment.");
  }

  await createPaymentRequestRow({ title, amount, deadline });
  revalidateDashboards();
  redirect("/payments?ok=1");
}

export async function concludePaymentRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const concludedDate = String(formData.get("concluded_date") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/archive");
  const transferToBank =
    String(formData.get("transfer_to_bank") ?? "").trim() === "1";

  if (!Number.isFinite(id) || id <= 0) failPayments("Invalid payment.");

  const request = await getPaymentRequestById(id);
  if (!request) failPayments("Payment request not found.");

  const when = /^\d{4}-\d{2}-\d{2}$/.test(concludedDate)
    ? `${concludedDate}T12:00:00.000Z`
    : new Date().toISOString();

  const patch: {
    concluded_at: string;
    released_to_bank?: string;
  } = { concluded_at: when };

  if (transferToBank) {
    const pot = await getContributionRemaining(id);
    const remaining = pot?.remaining ?? 0;
    if (remaining > 0.009) {
      const alreadyReleased = pot?.released ?? 0;
      patch.released_to_bank = (alreadyReleased + remaining).toFixed(2);
    }
  }

  await updatePaymentRequestRow(id, patch);
  revalidateDashboards();
  okReturn(
    returnTo.startsWith("/archive") ? returnTo : "/archive",
    transferToBank ? "concluded_transferred" : "concluded",
  );
}

export async function reopenPaymentRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) failPayments("Invalid payment.");

  await updatePaymentRequestRow(id, { concluded_at: null });
  revalidateDashboards();
  redirect("/payments?ok=reopened");
}

export async function recordMemberContribution(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const requestId = Number(formData.get("payment_request_id"));
  const memberId = Number(formData.get("member_id"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "pledge").trim().toLowerCase();
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const returnTo = String(formData.get("return_to") ?? "/payments");
  const amount = Number(amountRaw);
  const status = statusRaw === "paid" ? "paid" : "pledge";

  if (!Number.isFinite(requestId) || requestId <= 0) {
    failReturn(returnTo, "Choose a payment title.");
  }
  if (!Number.isFinite(memberId) || memberId <= 0) {
    failReturn(returnTo, "Choose a member.");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    failReturn(returnTo, "Enter a valid amount.");
  }

  const request = await getPaymentRequestById(requestId);
  if (!request) failReturn(returnTo, "Payment title not found.");

  const member = await getMemberById(memberId);
  if (!member) failReturn(returnTo, "Member not found.");

  if (amount + 1e-9 < Number(request.amount)) {
    failReturn(
      returnTo,
      `Amount must be at least the minimum (${request.amount}).`,
    );
  }

  const paymentDate =
    status === "paid"
      ? /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
        ? paymentDateRaw
        : new Date().toISOString().slice(0, 10)
      : /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
        ? paymentDateRaw
        : null;

  const existing = await findPaymentForMemberRequest(requestId, memberId);
  if (existing) {
    await updatePaymentRow(existing.id, {
      amount: amount.toFixed(2),
      status,
      payment_date: paymentDate,
      notes,
    });
  } else {
    await createPaymentRow({
      payment_request_id: requestId,
      member_id: memberId,
      amount,
      status,
      payment_date: paymentDate,
      notes,
    });
  }

  revalidateDashboards(`/members/${memberId}`);
  okReturn(returnTo, "contributed");
}

export async function saveBoardContribution(formData: FormData): Promise<void> {
  await requireAdmin();
  const requestId = Number(formData.get("payment_request_id"));
  const memberId = Number(formData.get("member_id"));
  const paymentIdRaw = String(formData.get("payment_id") ?? "").trim();
  const paymentId = paymentIdRaw ? Number(paymentIdRaw) : NaN;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "pledge").trim().toLowerCase();
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const returnTo = String(formData.get("return_to") ?? "/payments");
  const status = statusRaw === "paid" ? "paid" : "pledge";
  const amount = Number(amountRaw);

  if (!Number.isFinite(requestId) || requestId <= 0) {
    failReturn(returnTo, "Invalid payment.");
  }
  if (!Number.isFinite(memberId) || memberId <= 0) {
    failReturn(returnTo, "Invalid member.");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    failReturn(returnTo, "Enter a valid amount.");
  }

  const request = await getPaymentRequestById(requestId);
  if (!request) failReturn(returnTo, "Payment not found.");

  if (amount + 1e-9 < Number(request.amount)) {
    failReturn(
      returnTo,
      `Amount must be at least the minimum (${request.amount}).`,
    );
  }

  const member = await getMemberById(memberId);
  if (!member) failReturn(returnTo, "Member not found.");

  const paymentDate =
    status === "paid"
      ? /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
        ? paymentDateRaw
        : new Date().toISOString().slice(0, 10)
      : /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
        ? paymentDateRaw
        : null;

  if (Number.isFinite(paymentId) && paymentId > 0) {
    const existing = await getPaymentById(paymentId);
    if (!existing) failReturn(returnTo, "Contribution not found.");
    await updatePaymentRow(paymentId, {
      amount: amount.toFixed(2),
      status,
      payment_date: paymentDate,
      notes,
    });
  } else {
    const existing = await findPaymentForMemberRequest(requestId, memberId);
    if (existing) {
      await updatePaymentRow(existing.id, {
        amount: amount.toFixed(2),
        status,
        payment_date: paymentDate,
        notes,
      });
    } else {
      await createPaymentRow({
        payment_request_id: requestId,
        member_id: memberId,
        amount,
        status,
        payment_date: paymentDate,
        notes,
      });
    }
  }

  revalidateDashboards(`/members/${memberId}`);
  okReturn(returnTo, "contributed");
}

export async function markPaymentPaid(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("return_to") ?? `/members`);

  if (!Number.isFinite(id) || id <= 0) {
    failReturn(returnTo, "Invalid payment.");
  }

  const payment = await getPaymentById(id);
  if (!payment) failReturn(returnTo, "Payment not found.");

  const today = new Date().toISOString().slice(0, 10);
  await updatePaymentRow(id, {
    status: "paid",
    payment_date: payment.payment_date || today,
  });

  revalidateDashboards(`/members/${payment.member_id}`);
  okReturn(returnTo, "status");
}

export async function clearMemberContribution(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("return_to") ?? "/payments");

  if (!Number.isFinite(id) || id <= 0) {
    failReturn(returnTo, "Invalid payment.");
  }

  const payment = await getPaymentById(id);
  if (!payment) failReturn(returnTo, "Payment not found.");

  await deletePaymentRow(id);
  revalidateDashboards(`/members/${payment.member_id}`);
  okReturn(returnTo, "cleared");
}
