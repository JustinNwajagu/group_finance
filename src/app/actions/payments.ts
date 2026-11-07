"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listMemberOptions } from "@/lib/data";
import { sql } from "@/lib/db";

function failPayments(msg: string): never {
  redirect("/payments?error=" + encodeURIComponent(msg));
}

function failMembers(msg: string): never {
  redirect("/members?error=" + encodeURIComponent(msg));
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

  await sql(
    `insert into payment_requests (title, amount, deadline)
     values ($1, $2, $3::date)`,
    [title, amount.toFixed(2), deadline],
  );

  const created = await sql<{ id: number }>(
    `select id from payment_requests
     where title = $1 and deadline = $2::date
     order by id desc
     limit 1`,
    [title, deadline],
  );
  const requestId = created[0]?.id;
  if (!requestId) failPayments("Failed to create payment request.");

  for (const member of members) {
    await sql(
      `insert into payments (payment_request_id, member_id, amount, status)
       values ($1, $2, $3, 'pledge')`,
      [requestId, member.id, amount.toFixed(2)],
    );
  }

  revalidatePath("/payments");
  revalidatePath("/members");
  for (const member of members) {
    revalidatePath(`/members/${member.id}`);
  }
  redirect("/payments?ok=1");
}

export async function concludePaymentRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const concludedDate = String(formData.get("concluded_date") ?? "").trim();

  if (!Number.isFinite(id) || id <= 0) failPayments("Invalid payment.");

  const when = /^\d{4}-\d{2}-\d{2}$/.test(concludedDate)
    ? `${concludedDate}T12:00:00.000Z`
    : new Date().toISOString();

  await sql(
    `update payment_requests
     set concluded_at = $1::timestamptz
     where id = $2`,
    [when, id],
  );

  revalidatePath("/payments");
  revalidatePath("/members");
  redirect("/payments?ok=concluded");
}

export async function reopenPaymentRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) failPayments("Invalid payment.");

  await sql(
    `update payment_requests set concluded_at = null where id = $1`,
    [id],
  );

  revalidatePath("/payments");
  revalidatePath("/members");
  redirect("/payments?ok=reopened");
}

export async function recordMemberContribution(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const requestId = Number(formData.get("payment_request_id"));
  const memberId = Number(formData.get("member_id"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  // Contribution form means "mark contributed" unless admin explicitly picks pledge.
  const statusRaw = String(formData.get("status") ?? "paid").trim().toLowerCase();
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const amount = Number(amountRaw);
  const status = statusRaw === "pledge" ? "pledge" : "paid";

  if (!Number.isFinite(requestId) || requestId <= 0) {
    failPayments("Choose a payment title.");
  }
  if (!Number.isFinite(memberId) || memberId <= 0) {
    failPayments("Choose a member.");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    failPayments("Enter a valid amount.");
  }

  const request = await sql<{ id: number; amount: string }>(
    "select id, amount::text as amount from payment_requests where id = $1",
    [requestId],
  );
  if (!request[0]) failPayments("Payment title not found.");

  const member = await sql<{ id: number }>(
    "select id from members where id = $1",
    [memberId],
  );
  if (!member[0]) failPayments("Member not found.");

  if (amount + 1e-9 < Number(request[0].amount)) {
    failPayments(
      `Amount must be at least the minimum (${request[0].amount}).`,
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

  const existing = await sql<{ id: number }>(
    `select id from payments
     where payment_request_id = $1 and member_id = $2
     limit 1`,
    [requestId, memberId],
  );

  if (existing[0]) {
    await sql(
      `update payments
       set amount = $1,
           status = $2,
           payment_date = $3::date
       where id = $4`,
      [amount.toFixed(2), status, paymentDate, Number(existing[0].id)],
    );
  } else {
    await sql(
      `insert into payments
         (payment_request_id, member_id, amount, status, payment_date)
       values ($1, $2, $3, $4, $5::date)`,
      [requestId, memberId, amount.toFixed(2), status, paymentDate],
    );
  }

  // Confirm the row is paid when that was requested — catch silent no-op updates.
  if (status === "paid") {
    const check = await sql<{ status: string }>(
      `select status from payments
       where payment_request_id = $1 and member_id = $2
       limit 1`,
      [requestId, memberId],
    );
    if (check[0]?.status !== "paid") {
      failPayments("Could not mark that member as contributed. Try again.");
    }
  }

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  redirect(
    status === "paid"
      ? "/payments?ok=contributed"
      : "/payments?ok=pledged",
  );
}

export async function markPaymentPaid(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("return_to") ?? "/payments");

  if (!Number.isFinite(id) || id <= 0) {
    redirect(returnTo.split("?")[0] + "?error=" + encodeURIComponent("Invalid payment."));
  }

  const rows = await sql<{ id: number; member_id: number }>(
    "select id, member_id from payments where id = $1",
    [id],
  );
  const payment = rows[0];
  if (!payment) {
    redirect(returnTo.split("?")[0] + "?error=" + encodeURIComponent("Payment not found."));
  }

  const today = new Date().toISOString().slice(0, 10);
  await sql(
    `update payments
     set status = 'paid',
         payment_date = coalesce(payment_date, $1::date)
     where id = $2`,
    [today, id],
  );

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${payment.member_id}`);
  const base = returnTo.startsWith("/") ? returnTo.split("?")[0] : "/payments";
  redirect(`${base}?ok=paid`);
}

export async function markPaymentPledge(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("return_to") ?? "/payments");

  if (!Number.isFinite(id) || id <= 0) {
    failMembers("Invalid payment.");
  }

  const rows = await sql<{ id: number; member_id: number }>(
    "select id, member_id from payments where id = $1",
    [id],
  );
  const payment = rows[0];
  if (!payment) failMembers("Payment not found.");

  await sql(
    `update payments set status = 'pledge' where id = $1`,
    [id],
  );

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${payment.member_id}`);
  const base = returnTo.startsWith("/") ? returnTo.split("?")[0] : "/members";
  redirect(`${base}?ok=amended`);
}
