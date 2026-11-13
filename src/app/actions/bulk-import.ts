"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  matchMember,
  parseDateCell,
  parseMoneyCell,
  parseStatusCell,
  parseUploadedSheet,
  requireColumns,
  yearFromTitle,
  type BulkValidationIssue,
} from "@/lib/bulk-upload";
import {
  allocateAmountAcrossYearRange,
  monthCreditsFromPayments,
} from "@/lib/dues-months";
import { isPaymentDateAllowed, todayIsoDate } from "@/lib/format";
import {
  createDuesPayment,
  createDuesSchedule,
  createPaymentRequestRow,
  createPaymentRow,
  findPaymentForMemberRequest,
  getDuesScheduleByYear,
  listAllDuesSchedules,
  listAllMembers,
  listDuesPaymentsForSchedule,
  updateDuesScheduleRow,
  updatePaymentRow,
  type DuesScheduleRow,
} from "@/lib/store";

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

function ok(path: string, okCode: string, extra?: Record<string, string>): never {
  const q = new URLSearchParams({ ok: okCode, ...extra });
  redirect(`${path}?${q.toString()}`);
}

function formatIssues(issues: BulkValidationIssue[]): string {
  const shown = issues.slice(0, 8);
  const body = shown
    .map((i) => (i.row > 0 ? `Row ${i.row}: ${i.message}` : i.message))
    .join(" ");
  const more =
    issues.length > shown.length
      ? ` (+${issues.length - shown.length} more)`
      : "";
  return body + more;
}

export async function bulkImportContributions(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const file = formData.get("file");
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const minAmount = Number(amountRaw);

  if (!(file instanceof File) || file.size === 0) {
    fail("/payments", "Choose a CSV or Excel file to upload.");
  }
  if (!Number.isFinite(minAmount) || minAmount < 0) {
    fail("/payments", "Enter a valid minimum amount for this contribution.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    fail("/payments", "Choose a payment deadline.");
  }

  const parsed = await parseUploadedSheet(file);
  if ("error" in parsed) fail("/payments", parsed.error);

  const headerIssues = requireColumns(parsed, ["member", "amount", "status"]);
  if (headerIssues.length) fail("/payments", formatIssues(headerIssues));

  const members = await listAllMembers();
  const issues: BulkValidationIssue[] = [];
  const prepared: Array<{
    memberId: number;
    amount: number;
    status: "paid" | "pledge";
    payment_date: string | null;
    notes: string | null;
  }> = [];

  parsed.rows.forEach((row, idx) => {
    const rowNum = idx + 2; // header is row 1
    const memberName = row.member ?? "";
    const amount = parseMoneyCell(row.amount ?? "");
    const statusRaw = (row.status ?? "").trim();
    const status = statusRaw ? parseStatusCell(statusRaw) : null;
    const paymentDate = parseDateCell(row.payment_date ?? "");
    const notes = (row.notes ?? "").trim() || null;

    if (!memberName) {
      issues.push({ row: rowNum, message: "Member is required." });
      return;
    }
    const member = matchMember(members, memberName);
    if (!member) {
      issues.push({
        row: rowNum,
        message: `Unknown member "${memberName}".`,
      });
      return;
    }
    if (amount == null || amount < 0) {
      issues.push({ row: rowNum, message: "Amount must be a valid number." });
      return;
    }
    if (amount + 1e-9 < minAmount) {
      issues.push({
        row: rowNum,
        message: `Amount must be at least ${minAmount.toFixed(2)}.`,
      });
      return;
    }
    if (!statusRaw || status == null) {
      issues.push({
        row: rowNum,
        message: 'Status is required and must be "paid" or "pledge".',
      });
      return;
    }
    if ((row.payment_date ?? "").trim() && !paymentDate) {
      issues.push({
        row: rowNum,
        message: "Payment date must be a valid date (YYYY-MM-DD).",
      });
      return;
    }
    if (paymentDate && !isPaymentDateAllowed(paymentDate)) {
      issues.push({
        row: rowNum,
        message: "Payment date cannot be in the future.",
      });
      return;
    }

    prepared.push({
      memberId: member.id,
      amount,
      status,
      payment_date:
        status === "paid"
          ? paymentDate || todayIsoDate()
          : paymentDate,
      notes,
    });
  });

  if (prepared.length === 0 && issues.length === 0) {
    fail("/payments", "No data rows found in the spreadsheet.");
  }
  if (issues.length) fail("/payments", formatIssues(issues));

  // Past deadline → contribution is closed and lands in Archive.
  const today = new Date().toISOString().slice(0, 10);
  const archived = deadline < today;
  const concluded_at = archived ? `${deadline}T12:00:00.000Z` : null;

  const request = await createPaymentRequestRow({
    title: parsed.title,
    amount: minAmount,
    deadline,
    concluded_at,
  });

  for (const row of prepared) {
    const existing = await findPaymentForMemberRequest(
      request.id,
      row.memberId,
    );
    if (existing) {
      await updatePaymentRow(existing.id, {
        amount: row.amount.toFixed(2),
        status: row.status,
        payment_date: row.payment_date,
        notes: row.notes,
      });
    } else {
      await createPaymentRow({
        payment_request_id: request.id,
        member_id: row.memberId,
        amount: row.amount,
        status: row.status,
        payment_date: row.payment_date,
        notes: row.notes,
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/archive");
  revalidatePath("/members");
  const dest = archived ? "/archive" : "/payments";
  ok(dest, "bulk_contributions", {
    count: String(prepared.length),
    title: parsed.title,
  });
}

export async function bulkImportDues(formData: FormData): Promise<void> {
  await requireAdmin();

  const file = formData.get("file");
  const monthlyRaw = String(formData.get("monthly_amount") ?? "").trim();
  const yearRaw = String(formData.get("year") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const monthly = Number(monthlyRaw);

  if (!(file instanceof File) || file.size === 0) {
    fail("/dues", "Choose a CSV or Excel file to upload.");
  }
  if (!Number.isFinite(monthly) || monthly <= 0) {
    fail("/dues", "Enter a valid monthly dues amount.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    fail("/dues", "Choose a payment deadline.");
  }

  const parsed = await parseUploadedSheet(file);
  if ("error" in parsed) fail("/dues", parsed.error);

  const yearFromForm = Number(yearRaw);
  const yearFromFile = yearFromTitle(parsed.title);
  const year =
    Number.isFinite(yearFromForm) && yearFromForm >= 2000 && yearFromForm <= 2100
      ? yearFromForm
      : yearFromFile;
  if (year == null || year < 2000 || year > 2100) {
    fail(
      "/dues",
      "Set a dues year (2000–2100), or include the year in the file name (e.g. 2026-Dues.xlsx).",
    );
  }

  const headerIssues = requireColumns(parsed, ["member", "amount"]);
  if (headerIssues.length) fail("/dues", formatIssues(headerIssues));

  const today = todayIsoDate();
  const archived = deadline < today;
  let schedule = await getDuesScheduleByYear(year);
  if (!schedule) {
    schedule = await createDuesSchedule({
      year,
      monthly_amount: monthly,
      title: parsed.title,
      deadline,
      concluded_at: archived ? `${deadline}T12:00:00.000Z` : null,
    });
  } else {
    // Already open or archived — never open again; use that year's monthly split.
    if (Math.abs(Number(schedule.monthly_amount) - monthly) > 0.009) {
      // Keep going with the existing year's rate; form monthly is only for new years.
    }
  }

  const anchorMonthly = Number(schedule.monthly_amount);
  const members = await listAllMembers();
  const allSchedules = await listAllDuesSchedules();
  const schedulesByYear = new Map<number, DuesScheduleRow>(
    allSchedules.map((s) => [s.year, s]),
  );
  schedulesByYear.set(schedule.year, schedule);

  const issues: BulkValidationIssue[] = [];
  const prepared: Array<{
    scheduleId: number;
    memberId: number;
    amount: number;
    covered_months: number[];
    payment_date: string;
    notes: string | null;
  }> = [];

  // Credits per member/year so rows in this file stack correctly.
  const creditsByMemberYear = new Map<string, number[]>();
  async function creditsFor(memberId: number, yearKey: number, scheduleId: number) {
    const key = `${memberId}:${yearKey}`;
    if (creditsByMemberYear.has(key)) return creditsByMemberYear.get(key)!;
    const payments = (await listDuesPaymentsForSchedule(scheduleId)).filter(
      (p) => p.member_id === memberId,
    );
    const credits = monthCreditsFromPayments(payments);
    creditsByMemberYear.set(key, credits);
    return credits;
  }

  async function ensureYear(targetYear: number): Promise<DuesScheduleRow> {
    const existing = schedulesByYear.get(targetYear) ?? (await getDuesScheduleByYear(targetYear));
    if (existing) {
      schedulesByYear.set(targetYear, existing);
      return existing;
    }
    const created = await createDuesSchedule({
      year: targetYear,
      monthly_amount: anchorMonthly,
      title: `${targetYear} Dues (Sept ${targetYear}–Aug ${targetYear + 1})`,
      deadline: `${targetYear + 1}-09-30`,
    });
    schedulesByYear.set(targetYear, created);
    return created;
  }

  for (let idx = 0; idx < parsed.rows.length; idx += 1) {
    const row = parsed.rows[idx];
    const rowNum = idx + 2;
    const memberName = row.member ?? "";
    const amount = parseMoneyCell(row.amount ?? "");
    const paymentDate = parseDateCell(row.payment_date ?? "");
    const notes = (row.notes ?? "").trim() || null;

    if (!memberName) {
      issues.push({ row: rowNum, message: "Member is required." });
      continue;
    }
    const member = matchMember(members, memberName);
    if (!member) {
      issues.push({
        row: rowNum,
        message: `Unknown member "${memberName}".`,
      });
      continue;
    }
    if (amount == null || amount <= 0) {
      issues.push({ row: rowNum, message: "Amount must be a positive number." });
      continue;
    }
    if ((row.payment_date ?? "").trim() && !paymentDate) {
      issues.push({
        row: rowNum,
        message: "Payment date must be a valid date (YYYY-MM-DD).",
      });
      continue;
    }
    if (paymentDate && !isPaymentDateAllowed(paymentDate)) {
      issues.push({
        row: rowNum,
        message: "Payment date cannot be in the future.",
      });
      continue;
    }

    // Grow a prospective range until the amount (incl. partial month) fits,
    // using each affected year's own monthly rate — not a single-year split.
    let endYear = year;
    let allocations = null as ReturnType<typeof allocateAmountAcrossYearRange>;
    for (let guard = 0; guard < 20 && !allocations; guard += 1) {
      const creditsByYear = new Map<number, number[]>();
      const monthlyByYear = new Map<number, number>();
      for (let y = year; y <= endYear; y += 1) {
        const scheduleForYear = await ensureYear(y);
        monthlyByYear.set(y, Number(scheduleForYear.monthly_amount));
        creditsByYear.set(
          y,
          [...(await creditsFor(member.id, y, scheduleForYear.id))],
        );
      }
      allocations = allocateAmountAcrossYearRange(
        creditsByYear,
        monthlyByYear,
        year,
        endYear,
        amount,
      );
      if (!allocations) endYear += 1;
    }

    if (!allocations) {
      issues.push({
        row: rowNum,
        message: `Could not place ${member.name}'s payment across dues years starting ${year}.`,
      });
      continue;
    }

    for (const allocation of allocations) {
      const scheduleForYear = schedulesByYear.get(allocation.year);
      if (!scheduleForYear) {
        issues.push({
          row: rowNum,
          message: `Dues year ${allocation.year} is missing.`,
        });
        continue;
      }
      // Reserve credits for later rows in this file.
      const key = `${member.id}:${allocation.year}`;
      const credits =
        creditsByMemberYear.get(key) ??
        Array.from({ length: 12 }, () => 0);
      const share =
        allocation.amount / Math.max(1, allocation.covered_months.length);
      for (const m of allocation.covered_months) {
        credits[m - 1] = Number(((credits[m - 1] ?? 0) + share).toFixed(2));
      }
      creditsByMemberYear.set(key, credits);

      prepared.push({
        scheduleId: scheduleForYear.id,
        memberId: member.id,
        amount: allocation.amount,
        covered_months: allocation.covered_months,
        payment_date: paymentDate || todayIsoDate(),
        notes: allocation.partial
          ? notes
            ? `${notes} (partial month)`
            : "Partial month payment"
          : notes,
      });
    }
  }

  if (prepared.length === 0 && issues.length === 0) {
    fail("/dues", "No data rows found in the spreadsheet.");
  }
  if (issues.length) fail("/dues", formatIssues(issues));

  for (const row of prepared) {
    await createDuesPayment({
      dues_schedule_id: row.scheduleId,
      member_id: row.memberId,
      amount: row.amount,
      covered_months: row.covered_months,
      payment_date: row.payment_date,
      notes: row.notes,
    });
  }

  if (archived && !schedule.concluded_at) {
    await updateDuesScheduleRow(schedule.id, {
      deadline,
      concluded_at: `${deadline}T12:00:00.000Z`,
    });
  } else if (schedule.deadline !== deadline) {
    await updateDuesScheduleRow(schedule.id, { deadline });
  }

  revalidatePath("/");
  revalidatePath("/dues");
  revalidatePath("/archive");
  revalidatePath("/members");
  const dest = archived || schedule.concluded_at ? "/archive" : "/dues";
  const memberRows = new Set(prepared.map((p) => p.memberId)).size;
  ok(dest, "bulk_dues", {
    year: String(year),
    count: String(memberRows),
    title: parsed.title,
  });
}
