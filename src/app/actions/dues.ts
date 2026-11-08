"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  monthsCoveredForMember,
  remainingMonths,
} from "@/lib/dues-data";
import { monthsFromAmount, takeNextUnpaidMonths } from "@/lib/dues-months";
import {
  createDuesPayment,
  createDuesSchedule,
  deleteDuesPayment,
  getDuesPaymentById,
  getDuesScheduleById,
  getDuesScheduleByYear,
  getMemberById,
  listDuesPaymentsForSchedule,
} from "@/lib/store";

function failDues(msg: string, year?: number): never {
  const q = new URLSearchParams({ error: msg });
  if (year) q.set("year", String(year));
  redirect(`/dues?${q.toString()}`);
}

function okDues(ok: string, year: number): never {
  redirect(`/dues?year=${year}&ok=${ok}`);
}

function revalidateDues(...extra: string[]) {
  revalidatePath("/");
  revalidatePath("/dues");
  revalidatePath("/members");
  for (const path of extra) revalidatePath(path);
}

export async function createDuesYear(formData: FormData): Promise<void> {
  await requireAdmin();

  const year = Number(formData.get("year"));
  const amountRaw = String(formData.get("monthly_amount") ?? "").trim();
  const monthly = Number(amountRaw);

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    failDues("Enter a valid year (2000–2100).");
  }
  if (!Number.isFinite(monthly) || monthly <= 0) {
    failDues("Enter a valid monthly dues amount.", year);
  }

  const existing = await getDuesScheduleByYear(year);
  if (existing) {
    failDues(`Dues for ${year} already exist.`, year);
  }

  await createDuesSchedule({ year, monthly_amount: monthly });
  revalidateDues();
  okDues("year", year);
}

export async function recordDuesPayment(formData: FormData): Promise<void> {
  await requireAdmin();

  const scheduleId = Number(formData.get("dues_schedule_id"));
  const memberId = Number(formData.get("member_id"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const amount = Number(amountRaw);

  if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
    failDues("Choose a dues year.");
  }
  if (!Number.isFinite(memberId) || memberId <= 0) {
    failDues("Choose a member.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    failDues("Enter a valid amount paid.");
  }

  const schedule = await getDuesScheduleById(scheduleId);
  if (!schedule) failDues("Dues year not found.");

  const member = await getMemberById(memberId);
  if (!member) failDues("Member not found.", schedule.year);

  const monthly = Number(schedule.monthly_amount);
  const months = monthsFromAmount(amount, monthly);
  if (months == null) {
    failDues(
      `Amount must be a whole multiple of the monthly due (${schedule.monthly_amount}).`,
      schedule.year,
    );
  }

  const existing = (await listDuesPaymentsForSchedule(scheduleId)).filter(
    (p) => p.member_id === memberId,
  );
  const paid = monthsCoveredForMember(existing);
  const remaining = remainingMonths(paid);
  if (months > remaining) {
    failDues(
      `${member.name} only has ${remaining} unpaid month${remaining === 1 ? "" : "s"} left in ${schedule.year}.`,
      schedule.year,
    );
  }

  const covered_months = takeNextUnpaidMonths(paid, months);
  if (covered_months.length !== months) {
    failDues(
      `${member.name} only has ${remaining} unpaid month${remaining === 1 ? "" : "s"} left in ${schedule.year}.`,
      schedule.year,
    );
  }

  const payment_date = /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
    ? paymentDateRaw
    : new Date().toISOString().slice(0, 10);

  await createDuesPayment({
    dues_schedule_id: scheduleId,
    member_id: memberId,
    amount,
    covered_months,
    payment_date,
    notes,
  });

  revalidateDues(`/members/${memberId}`);
  okDues("recorded", schedule.year);
}

export async function removeDuesPayment(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) failDues("Invalid dues payment.");

  const payment = await getDuesPaymentById(id);
  if (!payment) failDues("Dues payment not found.");

  const schedule = await getDuesScheduleById(payment.dues_schedule_id);
  await deleteDuesPayment(id);
  revalidateDues(`/members/${payment.member_id}`);
  okDues("cleared", schedule?.year ?? new Date().getFullYear());
}
