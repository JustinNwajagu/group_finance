"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listMemberOptions } from "@/lib/data";
import { sql } from "@/lib/db";

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

  // Title only — members stay outstanding until an admin records a contribution
  // (pledge or paid). Both statuses count as contributed.
  await sql(
    `insert into payment_requests (title, amount, deadline)
     values ($1, $2, $3::date)`,
    [title, amount.toFixed(2), deadline],
  );

  revalidatePath("/payments");
  revalidatePath("/members");
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
  const statusRaw = String(formData.get("status") ?? "pledge").trim().toLowerCase();
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const amount = Number(amountRaw);
  const status = statusRaw === "paid" ? "paid" : "pledge";

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

  const check = await sql<{ status: string }>(
    `select status from payments
     where payment_request_id = $1 and member_id = $2
     limit 1`,
    [requestId, memberId],
  );
  if (!check[0] || (check[0].status !== "paid" && check[0].status !== "pledge")) {
    failPayments("Could not save that contribution. Try again.");
  }

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  redirect("/payments?ok=contributed");
}

/**
 * Create or update a contribution from the board dialog.
 * Requires amount (≥ payment minimum). Used for Add pledge / Mark paid /
 * status switches so admins always enter the member's amount.
 */
export async function saveBoardContribution(formData: FormData): Promise<void> {
  await requireAdmin();
  const requestId = Number(formData.get("payment_request_id"));
  const memberId = Number(formData.get("member_id"));
  const paymentIdRaw = String(formData.get("payment_id") ?? "").trim();
  const paymentId = paymentIdRaw ? Number(paymentIdRaw) : NaN;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "pledge").trim().toLowerCase();
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
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

  const request = await sql<{ id: number; amount: string }>(
    "select id, amount::text as amount from payment_requests where id = $1",
    [requestId],
  );
  if (!request[0]) failReturn(returnTo, "Payment not found.");

  if (amount + 1e-9 < Number(request[0].amount)) {
    failReturn(
      returnTo,
      `Amount must be at least the minimum (${request[0].amount}).`,
    );
  }

  const member = await sql<{ id: number }>(
    "select id from members where id = $1",
    [memberId],
  );
  if (!member[0]) failReturn(returnTo, "Member not found.");

  const paymentDate =
    status === "paid"
      ? /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
        ? paymentDateRaw
        : new Date().toISOString().slice(0, 10)
      : /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
        ? paymentDateRaw
        : null;

  if (Number.isFinite(paymentId) && paymentId > 0) {
    const existing = await sql<{ id: number; member_id: number }>(
      "select id, member_id from payments where id = $1",
      [paymentId],
    );
    if (!existing[0]) failReturn(returnTo, "Contribution not found.");
    await sql(
      `update payments
       set amount = $1,
           status = $2,
           payment_date = $3::date
       where id = $4`,
      [amount.toFixed(2), status, paymentDate, paymentId],
    );
  } else {
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
  }

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  okReturn(returnTo, "contributed");
}

/** Status-only flip used on member detail payment tables. */
export async function markPaymentPaid(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("return_to") ?? "/members");

  if (!Number.isFinite(id) || id <= 0) {
    failReturn(returnTo, "Invalid payment.");
  }

  const rows = await sql<{ id: number; member_id: number }>(
    "select id, member_id from payments where id = $1",
    [id],
  );
  const payment = rows[0];
  if (!payment) failReturn(returnTo, "Payment not found.");

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
  okReturn(returnTo, "status");
}

/** Remove a contribution record so the member returns to outstanding. */
export async function clearMemberContribution(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("return_to") ?? "/payments");

  if (!Number.isFinite(id) || id <= 0) {
    failReturn(returnTo, "Invalid payment.");
  }

  const rows = await sql<{ id: number; member_id: number }>(
    "select id, member_id from payments where id = $1",
    [id],
  );
  const payment = rows[0];
  if (!payment) failReturn(returnTo, "Payment not found.");

  await sql(`delete from payments where id = $1`, [id]);

  revalidatePath("/payments");
  revalidatePath("/members");
  revalidatePath(`/members/${payment.member_id}`);
  okReturn(returnTo, "cleared");
}
