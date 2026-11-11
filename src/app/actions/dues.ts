"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  monthsCoveredForMember,
  remainingMonths,
} from "@/lib/dues-data";
import {
  allocateMonthsAcrossYearRange,
  monthsFromAmount,
  takeNextUnpaidMonths,
} from "@/lib/dues-months";
import {
  createDuesPayment,
  createDuesSchedule,
  deleteDuesPayment,
  deleteDuesSchedule,
  getDuesPaymentById,
  getDuesScheduleById,
  getDuesScheduleByYear,
  getMemberById,
  listAllDuesSchedules,
  listDuesPaymentsForMember,
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

  await createDuesSchedule({
    year,
    monthly_amount: monthly,
    title: `${year} Dues`,
  });
  revalidateDues();
  okDues("year", year);
}

async function ensureScheduleForYear(
  year: number,
  monthly: number,
  titleHint: string,
) {
  const existing = await getDuesScheduleByYear(year);
  if (!existing) {
    return createDuesSchedule({
      year,
      monthly_amount: monthly,
      title: titleHint || `${year} Dues`,
    });
  }
  if (Math.abs(Number(existing.monthly_amount) - monthly) > 0.009) {
    failDues(
      `Dues for ${year} use ${existing.monthly_amount}/month, which does not match this payment’s monthly due (${monthly.toFixed(2)}).`,
      year,
    );
  }
  return existing;
}

export async function recordDuesPayment(formData: FormData): Promise<void> {
  await requireAdmin();

  const scheduleId = Number(formData.get("dues_schedule_id"));
  const memberId = Number(formData.get("member_id"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const yearFromRaw = String(formData.get("year_from") ?? "").trim();
  const yearToRaw = String(formData.get("year_to") ?? "").trim();
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

  const payment_date = /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
    ? paymentDateRaw
    : new Date().toISOString().slice(0, 10);

  const existingCurrent = (await listDuesPaymentsForSchedule(schedule.id)).filter(
    (p) => p.member_id === memberId,
  );
  const paidCurrent = monthsCoveredForMember(existingCurrent);
  const remainingCurrent = remainingMonths(paidCurrent);

  const hasRange = Boolean(yearFromRaw || yearToRaw);
  const needsRange = months > remainingCurrent || months > 12;

  if (needsRange && !hasRange) {
    failDues(
      months > 12
        ? "This payment covers more than 12 months. Select a year range to split the breakdown."
        : `${member.name} only has ${remainingCurrent} unpaid month${remainingCurrent === 1 ? "" : "s"} left in ${schedule.year}. Select a year range to apply the rest to other years.`,
      schedule.year,
    );
  }

  // Single-year path when everything fits the open year and no range was given.
  if (!hasRange) {
    const covered_months = takeNextUnpaidMonths(paidCurrent, months);
    if (covered_months.length !== months) {
      failDues(
        `${member.name} only has ${remainingCurrent} unpaid month${remainingCurrent === 1 ? "" : "s"} left in ${schedule.year}.`,
        schedule.year,
      );
    }
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

  const yearFrom = Number(yearFromRaw || schedule.year);
  const yearTo = Number(yearToRaw || schedule.year);
  if (
    !Number.isFinite(yearFrom) ||
    !Number.isFinite(yearTo) ||
    yearFrom < 2000 ||
    yearTo < 2000 ||
    yearFrom > 2100 ||
    yearTo > 2100
  ) {
    failDues("Enter a valid year range (2000–2100).", schedule.year);
  }

  const start = Math.min(yearFrom, yearTo);
  const end = Math.max(yearFrom, yearTo);
  const spanYears = end - start + 1;
  if (months > spanYears * 12) {
    failDues(
      `${months} months need at least ${Math.ceil(months / 12)} year(s). Widen the year range.`,
      schedule.year,
    );
  }

  // Ensure every year in the range has a matching schedule (create if missing).
  const schedulesByYear = new Map<number, Awaited<ReturnType<typeof getDuesScheduleByYear>>>();
  for (let year = start; year <= end; year += 1) {
    const row = await ensureScheduleForYear(
      year,
      monthly,
      year === schedule.year ? schedule.title : `${year} Dues`,
    );
    schedulesByYear.set(year, row);
  }

  const memberPayments = await listDuesPaymentsForMember(memberId);
  const allSchedules = await listAllDuesSchedules();
  const scheduleYearById = new Map(allSchedules.map((s) => [s.id, s.year]));
  const paidByYear = new Map<number, boolean[]>();
  for (let year = start; year <= end; year += 1) {
    const scheduleForYear = schedulesByYear.get(year)!;
    const forYear = memberPayments.filter(
      (p) =>
        p.dues_schedule_id === scheduleForYear.id ||
        scheduleYearById.get(p.dues_schedule_id) === year,
    );
    paidByYear.set(year, monthsCoveredForMember(forYear));
  }

  const allocations = allocateMonthsAcrossYearRange(
    paidByYear,
    start,
    end,
    months,
  );
  if (!allocations) {
    failDues(
      `Not enough unpaid months for ${member.name} across ${start}–${end}. Open more years or reduce the amount.`,
      schedule.year,
    );
  }

  for (const allocation of allocations) {
    const scheduleForYear = schedulesByYear.get(allocation.year);
    if (!scheduleForYear) {
      failDues(`Dues year ${allocation.year} is missing.`, schedule.year);
    }
    const sliceAmount = allocation.covered_months.length * monthly;
    await createDuesPayment({
      dues_schedule_id: scheduleForYear.id,
      member_id: memberId,
      amount: sliceAmount,
      covered_months: allocation.covered_months,
      payment_date,
      notes,
    });
  }

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

export async function deleteDuesYear(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) failDues("Invalid dues year.");

  const schedule = await getDuesScheduleById(id);
  if (!schedule) failDues("Dues year not found.");

  await deleteDuesSchedule(id);
  revalidateDues();

  const remaining = await listAllDuesSchedules();
  const nextYear = remaining[0]?.year;
  if (nextYear) {
    redirect(`/dues?year=${nextYear}&ok=year_deleted`);
  }
  redirect("/dues?ok=year_deleted");
}
