"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireAccess, requireAdmin } from "@/lib/auth";
import {
  certifyExpense,
  createExpense,
  deleteExpense,
  getExpenseById,
  updateBankAccountDetails,
} from "@/lib/store";
import type { ExpenseAllocation, ExpenseKind } from "@/lib/types";

function fail(message: string): never {
  redirect(`/expenses?error=${encodeURIComponent(message)}`);
}

function revalidateExpensePaths(memberIds: number[] = []) {
  revalidatePath("/expenses");
  revalidatePath("/");
  for (const id of memberIds) {
    revalidatePath(`/members/${id}`);
  }
}

function parseAllocations(formData: FormData): ExpenseAllocation[] {
  const memberIds = formData.getAll("alloc_member_id");
  const amounts = formData.getAll("alloc_amount");
  const out: ExpenseAllocation[] = [];
  const len = Math.max(memberIds.length, amounts.length);
  for (let i = 0; i < len; i += 1) {
    const member_id = Number(memberIds[i] ?? "");
    const amount = Number(amounts[i] ?? "");
    if (!Number.isFinite(member_id) || member_id <= 0) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push({
      member_id,
      amount: amount.toFixed(2),
    });
  }
  return out;
}

export async function saveBankAccountDetails(
  formData: FormData,
): Promise<void> {
  const viewer = await requireAdmin();
  const bank_name = String(formData.get("bank_name") ?? "").trim();
  const account_name = String(formData.get("account_name") ?? "").trim();
  const account_number = String(formData.get("account_number") ?? "").trim();
  const bank_code = String(formData.get("bank_code") ?? "").trim();

  if (!bank_name || !account_name || !account_number) {
    fail("Bank name, account name, and account number are required.");
  }

  await updateBankAccountDetails({
    bank_name,
    account_name,
    account_number,
    bank_code,
    updated_by: viewer.email,
  });
  revalidatePath("/expenses");
  redirect("/expenses?ok=bank");
}

export async function recordExpense(formData: FormData): Promise<void> {
  const viewer = await requireAdmin();
  const expense_date = String(formData.get("expense_date") ?? "").trim();
  const amount = Number(formData.get("amount") ?? "");
  const kindRaw = String(formData.get("kind") ?? "miscellaneous").trim();
  const kind: ExpenseKind =
    kindRaw === "member" ? "member" : "miscellaneous";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    fail("Choose a valid expense date.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    fail("Enter an expense amount greater than zero.");
  }
  if (notes.length < 3) {
    fail("Add compulsory notes with the expense breakdown.");
  }

  let allocations: ExpenseAllocation[] = [];
  if (kind === "member") {
    allocations = parseAllocations(formData);
    if (allocations.length === 0) {
      fail("Add at least one member recipient and amount.");
    }
    const allocTotal = allocations.reduce(
      (sum, a) => sum + Number(a.amount),
      0,
    );
    if (Math.abs(allocTotal - amount) > 0.009) {
      fail(
        `Recipient amounts (${allocTotal.toFixed(2)}) must equal the expense total (${amount.toFixed(2)}).`,
      );
    }
  }

  await createExpense({
    expense_date,
    amount,
    kind,
    notes,
    allocations,
    created_by_email: viewer.email,
    created_by_name: viewer.name,
  });

  revalidateExpensePaths(allocations.map((a) => a.member_id));
  redirect("/expenses?ok=recorded");
}

export async function certifyExpenseAction(
  formData: FormData,
): Promise<void> {
  const viewer = await requireAdmin();
  const id = Number(formData.get("expense_id") ?? "");
  if (!Number.isFinite(id) || id <= 0) {
    fail("Missing expense.");
  }

  const expense = await getExpenseById(id);
  if (!expense) fail("Expense not found.");

  if (
    expense.certifications.some(
      (c) => c.email === viewer.email.trim().toLowerCase(),
    )
  ) {
    fail("You already certified this expense.");
  }

  const updated = await certifyExpense(id, {
    email: viewer.email,
    name: viewer.name,
  });
  if (!updated) fail("Could not certify this expense.");

  revalidateExpensePaths(updated.allocations.map((a) => a.member_id));
  redirect(
    updated.certified_at || updated.certifications.length >= 2
      ? "/expenses?ok=certified"
      : "/expenses?ok=cert_progress",
  );
}

export async function removeExpense(formData: FormData): Promise<void> {
  const viewer = await requireAccess();
  if (!isAdmin(viewer)) {
    fail("Only admins can remove expenses.");
  }
  const id = Number(formData.get("expense_id") ?? "");
  if (!Number.isFinite(id) || id <= 0) {
    fail("Missing expense.");
  }
  const expense = await getExpenseById(id);
  if (!expense) fail("Expense not found.");
  if (expense.certifications.length >= 2 || expense.certified_at) {
    fail("Certified expenses cannot be removed.");
  }
  await deleteExpense(id);
  revalidateExpensePaths(expense.allocations.map((a) => a.member_id));
  redirect("/expenses?ok=removed");
}
