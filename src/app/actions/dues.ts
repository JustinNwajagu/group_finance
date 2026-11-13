"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit-log";
import {
  allocateAmountAcrossYearRange,
  earliestUnpaidYear,
  monthCreditsFromPayments,
  monthsFullyPaidFromCredits,
} from "@/lib/dues-months";
import { formatMoney, isPaymentDateAllowed, todayIsoDate } from "@/lib/format";
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
  const viewer = await requireAdmin();

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
  const created = await createDuesSchedule({
    year,
    monthly_amount: monthly,
    title: `${year} Dues`,
    deadline,
    concluded_at: archived ? `${deadline}T12:00:00.000Z` : null,
  });
  await recordAudit(viewer, {
    action: "dues.year.open",
    summary: archived
      ? `Opened ${year} dues into Archive (${formatMoney(monthly)}/mo)`
      : `Opened ${year} dues (${formatMoney(monthly)}/mo)`,
    entityType: "dues_schedule",
    entityId: created.id,
  });
  revalidateDues();
  if (archived) {
    redirect(`/archive?ok=year_archived&year=${year}`);
  }
  okDues("year", year);
}

export async function concludeDuesYear(formData: FormData): Promise<void> {
  const viewer = await requireAdmin();
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
  await recordAudit(viewer, {
    action: "dues.year.conclude",
    summary: `Archived ${schedule.year} dues`,
    entityType: "dues_schedule",
    entityId: id,
  });
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
      titleHint || `${year} Dues (Sept ${year}–Aug ${year + 1})`,
    deadline: deadlineHint || `${year + 1}-09-30`,
  });
}

export async function recordDuesPayment(formData: FormData): Promise<void> {
  const viewer = await requireAdmin();

  const scheduleId = Number(formData.get("dues_schedule_id"));
  const memberId = Number(formData.get("member_id"));
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paymentDateRaw = String(formData.get("payment_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
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

  // Always fill from the member's earliest unpaid dues year forward — never
  // skip an earlier year that still has unpaid months.
  const [memberPayments, allSchedules] = await Promise.all([
    listDuesPaymentsForMember(memberId),
    listAllDuesSchedules(),
  ]);
  const schedulesByYear = new Map<number, DuesScheduleRow>();
  for (const row of allSchedules) schedulesByYear.set(row.year, row);
  schedulesByYear.set(schedule.year, schedule);

  const scheduleYearById = new Map(
    [...schedulesByYear.values()].map((s) => [s.id, s.year]),
  );
  const creditsByYear = new Map<number, number[]>();
  const monthlyByYear = new Map<number, number>();
  for (const row of schedulesByYear.values()) {
    monthlyByYear.set(row.year, Number(row.monthly_amount));
    const forYear = memberPayments.filter(
      (p) =>
        p.dues_schedule_id === row.id ||
        scheduleYearById.get(p.dues_schedule_id) === row.year,
    );
    creditsByYear.set(row.year, monthCreditsFromPayments(forYear));
  }

  const earliestExisting = earliestUnpaidYear(
    [...schedulesByYear.keys()],
    creditsByYear,
    monthlyByYear,
  );

  let start: number;
  if (earliestExisting != null) {
    // Never jump past an earlier unpaid year, even if the admin opened a later one.
    start = earliestExisting;
  } else {
    // Every existing year is full — continue forward from the selected year
    // when it still has room, otherwise the next year after the latest schedule.
    const selectedCredits =
      creditsByYear.get(schedule.year) ?? Array.from({ length: 12 }, () => 0);
    const selectedPaid = monthsFullyPaidFromCredits(
      selectedCredits,
      Number(monthlyByYear.get(schedule.year) ?? monthly),
    );
    if (selectedPaid.some((v) => !v)) {
      start = schedule.year;
    } else {
      const latest = Math.max(...schedulesByYear.keys(), schedule.year);
      start = latest + 1;
    }
  }

  let end = Math.max(start, schedule.year);
  let allocations: ReturnType<typeof allocateAmountAcrossYearRange> = null;

  for (let guard = 0; guard < 25 && !allocations; guard += 1) {
    for (let year = start; year <= end; year += 1) {
      if (schedulesByYear.has(year) && creditsByYear.has(year)) continue;
      const row = await resolveScheduleForYear(
        year,
        monthly,
        year === schedule.year
          ? schedule.title
          : `${year} Dues (Sept ${year}–Aug ${year + 1})`,
        year === schedule.year ? schedule.deadline : `${year + 1}-09-30`,
      );
      schedulesByYear.set(year, row);
      scheduleYearById.set(row.id, row.year);
      monthlyByYear.set(year, Number(row.monthly_amount));
      const forYear = memberPayments.filter(
        (p) =>
          p.dues_schedule_id === row.id ||
          scheduleYearById.get(p.dues_schedule_id) === year,
      );
      creditsByYear.set(year, monthCreditsFromPayments(forYear));
    }

    // Fresh credit copies so a failed attempt does not poison the next.
    const creditsAttempt = new Map<number, number[]>();
    for (let year = start; year <= end; year += 1) {
      creditsAttempt.set(year, [...(creditsByYear.get(year) ?? [])]);
    }

    allocations = allocateAmountAcrossYearRange(
      creditsAttempt,
      monthlyByYear,
      start,
      end,
      amount,
    );
    if (!allocations) end += 1;
  }

  if (!allocations) {
    failDues(
      `Could not place ${formatMoney(amount)} for ${member.name} starting from ${start} (earliest unpaid). Reduce the amount or open earlier dues years.`,
      schedule.year,
      returnTo,
    );
  }

  if (allocations[0] && allocations[0].year !== start) {
    // Defensive: allocator should always begin at the first unpaid year.
    failDues(
      `${member.name} still owes dues in ${start}. Payments must fill that year before later years.`,
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

  const appliedYears = [
    ...new Set(allocations.map((a) => a.year)),
  ].sort((a, b) => a - b);
  const yearLabel =
    appliedYears.length === 1
      ? String(appliedYears[0])
      : `${appliedYears[0]}–${appliedYears[appliedYears.length - 1]}`;

  if (returnTo.startsWith("/archive")) {
    await recordAudit(viewer, {
      action: "dues.payment.record",
      summary: `Recorded ${formatMoney(amount)} dues for ${member.name} (${yearLabel}, from earliest unpaid)`,
      entityType: "dues_schedule",
      entityId: scheduleId,
    });
  }
  revalidateDues(`/members/${memberId}`);
  okDues("recorded", schedule.year, returnTo);
}

export async function removeDuesPayment(formData: FormData): Promise<void> {
  const viewer = await requireAdmin();
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
  if (returnTo.startsWith("/archive")) {
    await recordAudit(viewer, {
      action: "dues.payment.remove",
      summary: schedule
        ? `Removed dues payment #${id} (${schedule.year})`
        : `Removed dues payment #${id}`,
      entityType: "dues_payment",
      entityId: id,
    });
  }
  revalidateDues(`/members/${payment.member_id}`);
  okDues(
    "cleared",
    schedule?.year ?? new Date().getFullYear(),
    returnTo,
  );
}

export async function deleteDuesYear(formData: FormData): Promise<void> {
  const viewer = await requireAdmin();
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
  await recordAudit(viewer, {
    action: "dues.year.delete",
    summary: `Deleted ${schedule.year} dues year`,
    entityType: "dues_schedule",
    entityId: id,
  });
  revalidateDues();

  const remaining = await listAllDuesSchedules();
  const nextYear = remaining.filter((s) => !s.concluded_at)[0]?.year;
  if (nextYear) {
    redirect(`/dues?year=${nextYear}&ok=year_deleted`);
  }
  redirect("/dues?ok=year_deleted");
}
