"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function createPayment(formData: FormData): Promise<void> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const memberId = Number(formData.get("member_id"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paymentDate = String(formData.get("payment_date") ?? "").trim();
  const amount = Number(amountRaw);

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
    `insert into payments (title, member_id, amount, payment_date)
     values ($1, $2, $3, $4::date)`,
    [title, memberId, amount.toFixed(2), paymentDate],
  );

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  redirect("/payments?ok=1");
}
