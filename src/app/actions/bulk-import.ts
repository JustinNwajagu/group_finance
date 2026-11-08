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
  monthsCoveredForMember,
  remainingMonths,
} from "@/lib/dues-data";
import {
  monthsFromAmount as monthsFromDueAmount,
  takeNextUnpaidMonths,
} from "@/lib/dues-months";
import {
  createDuesPayment,
  createDuesSchedule,
  createPaymentRequestRow,
  createPaymentRow,
  findPaymentForMemberRequest,
  getDuesScheduleByYear,
  listAllMembers,
  listDuesPaymentsForSchedule,
  updatePaymentRow,
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

    prepared.push({
      memberId: member.id,
      amount,
      status,
      payment_date:
        status === "paid"
          ? paymentDate || new Date().toISOString().slice(0, 10)
          : paymentDate,
      notes,
    });
  });

  if (prepared.length === 0 && issues.length === 0) {
    fail("/payments", "No data rows found in the spreadsheet.");
  }
  if (issues.length) fail("/payments", formatIssues(issues));

  const request = await createPaymentRequestRow({
    title: parsed.title,
    amount: minAmount,
    deadline,
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
  ok("/payments", "bulk_contributions", {
    count: String(prepared.length),
    title: parsed.title,
  });
}

export async function bulkImportDues(formData: FormData): Promise<void> {
  await requireAdmin();

  const file = formData.get("file");
  const monthlyRaw = String(formData.get("monthly_amount") ?? "").trim();
  const yearRaw = String(formData.get("year") ?? "").trim();
  const monthly = Number(monthlyRaw);

  if (!(file instanceof File) || file.size === 0) {
    fail("/dues", "Choose a CSV or Excel file to upload.");
  }
  if (!Number.isFinite(monthly) || monthly <= 0) {
    fail("/dues", "Enter a valid monthly dues amount.");
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

  let schedule = await getDuesScheduleByYear(year);
  if (!schedule) {
    schedule = await createDuesSchedule({
      year,
      monthly_amount: monthly,
      title: parsed.title,
    });
  } else if (Math.abs(Number(schedule.monthly_amount) - monthly) > 0.009) {
    fail(
      "/dues",
      `Dues for ${year} already exist at ${schedule.monthly_amount} per month. Use that amount, or a different year.`,
    );
  }

  const members = await listAllMembers();
  const existingPayments = await listDuesPaymentsForSchedule(schedule.id);
  const issues: BulkValidationIssue[] = [];
  const prepared: Array<{
    memberId: number;
    amount: number;
    covered_months: number[];
    payment_date: string;
    notes: string | null;
  }> = [];

  // Apply rows sequentially so multiple rows for the same member stack months.
  const paidByMember = new Map<number, boolean[]>();
  for (const p of existingPayments) {
    const list = existingPayments.filter((x) => x.member_id === p.member_id);
    paidByMember.set(p.member_id, monthsCoveredForMember(list));
  }

  parsed.rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const memberName = row.member ?? "";
    const amount = parseMoneyCell(row.amount ?? "");
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
    if (amount == null || amount <= 0) {
      issues.push({ row: rowNum, message: "Amount must be a positive number." });
      return;
    }
    const months = monthsFromDueAmount(amount, monthly);
    if (months == null) {
      issues.push({
        row: rowNum,
        message: `Amount must be a whole multiple of the monthly due (${monthly.toFixed(2)}).`,
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

    const paid =
      paidByMember.get(member.id) ??
      Array.from({ length: 12 }, () => false);
    const remaining = remainingMonths(paid);
    if (months > remaining) {
      issues.push({
        row: rowNum,
        message: `${member.name} only has ${remaining} unpaid month(s) left in ${year}.`,
      });
      return;
    }
    const covered = takeNextUnpaidMonths(paid, months);
    if (covered.length !== months) {
      issues.push({
        row: rowNum,
        message: `${member.name} cannot cover ${months} more month(s).`,
      });
      return;
    }

    // Reserve months for later rows in this file.
    for (const m of covered) paid[m - 1] = true;
    paidByMember.set(member.id, paid);

    prepared.push({
      memberId: member.id,
      amount,
      covered_months: covered,
      payment_date: paymentDate || new Date().toISOString().slice(0, 10),
      notes,
    });
  });

  if (prepared.length === 0 && issues.length === 0) {
    fail("/dues", "No data rows found in the spreadsheet.");
  }
  if (issues.length) fail("/dues", formatIssues(issues));

  for (const row of prepared) {
    await createDuesPayment({
      dues_schedule_id: schedule.id,
      member_id: row.memberId,
      amount: row.amount,
      covered_months: row.covered_months,
      payment_date: row.payment_date,
      notes: row.notes,
    });
  }

  revalidatePath("/");
  revalidatePath("/dues");
  revalidatePath("/members");
  ok("/dues", "bulk_dues", {
    year: String(year),
    count: String(prepared.length),
    title: parsed.title,
  });
}
