"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { PaymentStatus } from "@/lib/types";

export async function createPayment(formData: FormData): Promise<void> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const memberId = Number(formData.get("member_id"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paymentDate = String(formData.get("payment_date") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "pledge").trim();
  const amount = Number(amountRaw);
  const status: PaymentStatus =
    statusRaw === "paid" ? "paid" : "pledge";

  const fail = (msg: string) => {
    redirect("/payments?error=" + encodeURIComponent(msg));
  };

  if (!title) fail("Title is required.");
  if (!Number.isFinite(memberId) || memberId <= 0) fail("Choose a member.");
  if (!Number.isFinite(amount) || amount < 0) fail("Enter a valid amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) fail("Choose a payment date.");

  const member = await sql<{ id: number }>(
    "select id from members where id = $1",
    [memberId],
  );
  if (!member[0]) fail("Member not found.");

  await sql(
    `insert into payments (title, member_id, amount, payment_date, status)
     values ($1, $2, $3, $4::date, $5)`,
    [title, memberId, amount.toFixed(2), paymentDate, status],
  );

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  redirect("/payments?ok=1");
}

export async function markPaymentPaid(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    redirect("/payments?error=" + encodeURIComponent("Invalid payment."));
  }

  const rows = await sql<{ id: number; member_id: number; status: string }>(
    "select id, member_id, status from payments where id = $1",
    [id],
  );
  const payment = rows[0];
  if (!payment) {
    redirect("/payments?error=" + encodeURIComponent("Payment not found."));
  }

  await sql(`update payments set status = 'paid' where id = $1`, [id]);

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${payment.member_id}`);
  redirect("/payments?ok=paid");
}
