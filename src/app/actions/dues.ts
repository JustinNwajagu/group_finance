"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  monthsCoveredForMember,
  remainingMonths,
} from "@/lib/dues-data";
import {
  allocateAmountAcrossYearRange,
  monthCreditsFromPayments,
  monthsFromAmount,
  takeNextUnpaidMonths,
} from "@/lib/dues-months";
import { isPaymentDateAllowed, todayIsoDate } from "@/lib/format";
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
  updateDuesScheduleRow,
  type DuesScheduleRow,
} from "@/lib/store";

function failDues(msg: string, year?: number, returnTo = "/dues"): never {
  const q = new URLSearchParams({ error: msg });
  if (year) q.set("year", String(year));
  const base = returnTo.startsWith("/") ? returnTo.split("?")[0] : "/dues";
  redirect(`${base}?${q.toString()}`);
}

function okDues(
  ok: string,
  year: number,
  returnTo = "/dues",
): never {
  const base = returnTo.startsWith("/") ? returnTo.split("?")[0] : "/dues";
  const q = new URLSearchParams({ year: String(year), ok });
  redirect(`${base}?${q.toString()}`);
}

function revalidateDues(...extra: string[]) {
  revalidatePath("/");
  revalidatePath("/dues");
  revalidatePath("/archive");
  revalidatePath("/members");
  for (const path of extra) revalidatePath(path);
}

export async function createDuesYear(formData: FormData): Promise<void> {
  await requireAdmin();

  const year = Number(formData.get("year"));
  const amountRaw = String(formData.get("monthly_amount") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const monthly = Number(amountRaw);

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    failDues("Enter a valid year (2000–2100).");
  }
  if (!Number.isFinite(monthly) || monthly <= 0) {
    failDues("Enter a valid monthly dues amount.", year);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    failDues("Choose a payment deadline.", year);
  }

  const existing = await getDuesScheduleByYear(year);
  if (existing) {
    failDues(
      existing.concluded_at
        ? `Dues for ${year} are already in Archive. Amend them there — they cannot be opened again.`
        : `Dues for ${year} are already open and cannot be opened again.`,
      year,
    );
  }

  const today = todayIsoDate();
  const archived = deadline < today;
  await createDuesSchedule({
    year,
    monthly_amount: monthly,
    title: `${year} Dues`,
    deadline,
    concluded_at: archived ? `${deadline}T12:00:00.000Z` : null,
  });
  revalidateDues();
  if (archived) {
    redirect(`/archive?ok=year_archived&year=${year}`);
  }
  okDues("year", year);
}

export async function concludeDuesYear(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const concludedDate = String(formData.get("concluded_date") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/archive");

  if (!Number.isFinite(id) || id <= 0) failDues("Invalid dues year.");
  const schedule = await getDuesScheduleById(id);
  if (!schedule) failDues("Dues year not found.");

  const when = /^\d{4}-\d{2}-\d{2}$/.test(concludedDate)
    ? `${concludedDate}T12:00:00.000Z`
    : new Date().toISOString();

  await updateDuesScheduleRow(id, { concluded_at: when });
  revalidateDues();
  const dest = returnTo.startsWith("/archive") ? returnTo : "/archive";
  redirect(
    `${dest.split("?")[0]}?ok=dues_concluded&year=${schedule.year}`,
  );
}


/**
 * Use an existing dues year as-is (including archived / different monthly).
 * Only create a brand-new year when none exists yet.
 */
async function resolveScheduleForYear(
  year: number,
  monthlyFallback: number,
  titleHint: string,
  deadlineHint?: string,
): Promise<DuesScheduleRow> {
  const existing = await getDuesScheduleByYear(year);
  if (existing) return existing;
  return createDuesSchedule({
    year,
    monthly_amount: monthlyFallback,
    title:
      titleHint || `${year} Dues (Sept ${year}–Sept ${year + 1})`,
    deadline: deadlineHint || `${year + 1}-09-30`,
  });
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
  const returnToRaw = String(formData.get("return_to") ?? "").trim();
  const amount = Number(amountRaw);
  const returnTo =
    returnToRaw.startsWith("/archive") || returnToRaw.startsWith("/dues")
      ? returnToRaw.split("?")[0]
      : "/dues";

  if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
    failDues("Choose a dues year.", undefined, returnTo);
  }
  if (!Number.isFinite(memberId) || memberId <= 0) {
    failDues("Choose a member.", undefined, returnTo);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    failDues("Enter a valid amount paid.", undefined, returnTo);
  }

  const schedule = await getDuesScheduleById(scheduleId);
  if (!schedule) failDues("Dues year not found.", undefined, returnTo);

  const member = await getMemberById(memberId);
  if (!member) failDues("Member not found.", schedule.year, returnTo);

  const monthly = Number(schedule.monthly_amount);
  if (!Number.isFinite(monthly) || monthly <= 0) {
    failDues("This dues year has an invalid monthly amount.", schedule.year, returnTo);
  }

  const today = todayIsoDate();
  if (paymentDateRaw && !isPaymentDateAllowed(paymentDateRaw, today)) {
    failDues("Payment date cannot be in the future.", schedule.year, returnTo);
  }
  const payment_date = /^\d{4}-\d{2}-\d{2}$/.test(paymentDateRaw)
    ? paymentDateRaw
    : today;

  const existingCurrent = (await listDuesPaymentsForSchedule(schedule.id)).filter(
    (p) => p.member_id === memberId,
  );
  const paidCurrent = monthsCoveredForMember(
    existingCurrent,
    schedule.monthly_amount,
  );
  const remainingCurrent = remainingMonths(paidCurrent);
  const wholeMonthsAtAnchor = monthsFromAmount(amount, monthly);
  const yearlyTotal = monthly * 12;
  const exceedsYear =
    amount > yearlyTotal + 0.009 ||
    (wholeMonthsAtAnchor != null && wholeMonthsAtAnchor > remainingCurrent);

  const hasRange = Boolean(yearFromRaw || yearToRaw);
  if (exceedsYear && !hasRange) {
    failDues(
      amount > yearlyTotal + 0.009
        ? `This payment is higher than the ${schedule.year} yearly total (${schedule.monthly_amount} × 12). Select a year range to split the excess across retrospective or prospective months.`
        : `${member.name} only has ${remainingCurrent} unpaid month${remainingCurrent === 1 ? "" : "s"} left in ${schedule.year}. Select a year range to apply the rest to other years.`,
      schedule.year,
      returnTo,
    );
  }

  // Single-year path when everything fits and no range was given.
  if (!hasRange) {
    if (wholeMonthsAtAnchor == null) {
      // Allow a single partial month when amount is below one monthly due
      // or otherwise not an exact multiple, as long as one incomplete month remains.
      const credits = monthCreditsFromPayments(existingCurrent);
      const partialMonth = takeNextUnpaidMonths(paidCurrent, 1)[0];
      if (!partialMonth) {
        failDues(
          `${member.name} has no unpaid months left in ${schedule.year}.`,
          schedule.year,
          returnTo,
        );
      }
      const already = credits[partialMonth - 1] ?? 0;
      const need = Number((monthly - already).toFixed(2));
      if (amount > need + 0.009) {
        failDues(
          `Amount must be a whole multiple of the monthly due (${schedule.monthly_amount}), or at most ${need.toFixed(2)} to finish the next partial month. For larger excess, select a year range.`,
          schedule.year,
          returnTo,
        );
      }
      await createDuesPayment({
        dues_schedule_id: scheduleId,
        member_id: memberId,
        amount,
        covered_months: [partialMonth],
        payment_date,
        notes,
      });
      revalidateDues(`/members/${memberId}`);
      okDues("recorded", schedule.year, returnTo);
    }

    const covered_months = takeNextUnpaidMonths(paidCurrent, wholeMonthsAtAnchor);
    if (covered_months.length !== wholeMonthsAtAnchor) {
      failDues(
        `${member.name} only has ${remainingCurrent} unpaid month${remainingCurrent === 1 ? "" : "s"} left in ${schedule.year}.`,
        schedule.year,
        returnTo,
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
    okDues("recorded", schedule.year, returnTo);
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
    failDues("Enter a valid year range (2000–2100).", schedule.year, returnTo);
  }

  const start = Math.min(yearFrom, yearTo);
  const end = Math.max(yearFrom, yearTo);

  // Range may go retrospective or prospective, but stays inside the selected
  // bounds — it does not spill to cover all months beyond that range.
  const schedulesByYear = new Map<number, DuesScheduleRow>();
  for (let year = start; year <= end; year += 1) {
    const row = await resolveScheduleForYear(
      year,
      monthly,
      year === schedule.year
        ? schedule.title
        : `${year} Dues (Sept ${year}–Sept ${year + 1})`,
      year === schedule.year ? schedule.deadline : `${year + 1}-09-30`,
    );
    schedulesByYear.set(year, row);
  }

  const memberPayments = await listDuesPaymentsForMember(memberId);
  const allSchedules = await listAllDuesSchedules();
  const scheduleYearById = new Map(allSchedules.map((s) => [s.id, s.year]));
  const creditsByYear = new Map<number, number[]>();
  const monthlyByYear = new Map<number, number>();
  for (let year = start; year <= end; year += 1) {
    const scheduleForYear = schedulesByYear.get(year)!;
    monthlyByYear.set(year, Number(scheduleForYear.monthly_amount));
    const forYear = memberPayments.filter(
      (p) =>
        p.dues_schedule_id === scheduleForYear.id ||
        scheduleYearById.get(p.dues_schedule_id) === year,
    );
    creditsByYear.set(year, monthCreditsFromPayments(forYear));
  }

  const allocations = allocateAmountAcrossYearRange(
    creditsByYear,
    monthlyByYear,
    start,
    end,
    amount,
  );
  if (!allocations) {
    failDues(
      `Not enough unpaid months for ${member.name} across ${start}–${end} to place this payment (including any partial month). Widen the selected range or reduce the amount.`,
      schedule.year,
      returnTo,
    );
  }

  for (const allocation of allocations) {
    const scheduleForYear = schedulesByYear.get(allocation.year);
    if (!scheduleForYear) {
      failDues(
        `Dues year ${allocation.year} is missing.`,
        schedule.year,
        returnTo,
      );
    }
    await createDuesPayment({
      dues_schedule_id: scheduleForYear.id,
      member_id: memberId,
      amount: allocation.amount,
      covered_months: allocation.covered_months,
      payment_date,
      notes: allocation.partial
        ? notes
          ? `${notes} (partial month)`
          : "Partial month payment"
        : notes,
    });
  }

  revalidateDues(`/members/${memberId}`);
  okDues("recorded", schedule.year, returnTo);
}

export async function removeDuesPayment(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnToRaw = String(formData.get("return_to") ?? "").trim();
  const returnTo =
    returnToRaw.startsWith("/archive") || returnToRaw.startsWith("/dues")
      ? returnToRaw.split("?")[0]
      : "/dues";
  if (!Number.isFinite(id) || id <= 0) {
    failDues("Invalid dues payment.", undefined, returnTo);
  }

  const payment = await getDuesPaymentById(id);
  if (!payment) failDues("Dues payment not found.", undefined, returnTo);

  const schedule = await getDuesScheduleById(payment.dues_schedule_id);
  await deleteDuesPayment(id);
  revalidateDues(`/members/${payment.member_id}`);
  okDues(
    "cleared",
    schedule?.year ?? new Date().getFullYear(),
    returnTo,
  );
}

export async function deleteDuesYear(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id) || id <= 0) failDues("Invalid dues year.");

  const schedule = await getDuesScheduleById(id);
  if (!schedule) failDues("Dues year not found.");

  const payments = await listDuesPaymentsForSchedule(id);
  if (payments.length > 0) {
    failDues(
      `Cannot remove ${schedule.year} dues while ${payments.length} payment(s) are recorded. Clear those payments first.`,
      schedule.year,
    );
  }

  await deleteDuesSchedule(id);
  revalidateDues();

  const remaining = await listAllDuesSchedules();
  const nextYear = remaining.filter((s) => !s.concluded_at)[0]?.year;
  if (nextYear) {
    redirect(`/dues?year=${nextYear}&ok=year_deleted`);
  }
  redirect("/dues?ok=year_deleted");
}
