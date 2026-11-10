"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, requireAccess, requireAdmin } from "@/lib/auth";
import {
  disbursedFromContribution,
  listContributionFundingOptions,
} from "@/lib/expenses-data";
import {
  certifyExpense,
  createExpense,
  deleteExpense,
  getExpenseById,
  getPaymentRequestById,
  listAllExpenses,
  updateBankAccountDetails,
} from "@/lib/store";
import type {
  ExpenseAllocation,
  ExpenseFundingSource,
  ExpenseKind,
} from "@/lib/types";

function fail(message: string): never {
  redirect(`/expenses?error=${encodeURIComponent(message)}`);
}

function revalidateExpensePaths(memberIds: number[] = []) {
  revalidatePath("/expenses");
  revalidatePath("/payments");
  revalidatePath("/archive");
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

function parseKind(raw: string): ExpenseKind | null {
  if (raw === "member" || raw === "miscellaneous" || raw === "meeting") {
    return raw;
  }
  return null;
}

function parseFunding(raw: string): ExpenseFundingSource | null {
  if (raw === "contribution" || raw === "bank" || raw === "both") return raw;
  return null;
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
  const kind = parseKind(String(formData.get("kind") ?? "").trim());
  const funding_source = parseFunding(
    String(formData.get("funding_source") ?? "").trim(),
  );
  const notes = String(formData.get("notes") ?? "").trim();
  const paymentRequestId = Number(formData.get("payment_request_id") ?? "");

  if (!kind) fail("Choose whether this is a member, meeting, or miscellaneous expense.");
  if (!funding_source) {
    fail("Choose funding from a contribution, the bank, or both.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    fail("Choose a valid expense date.");
  }

  let contribution_amount = 0;
  let bank_amount = 0;

  if (funding_source === "contribution") {
    contribution_amount = Number(formData.get("contribution_amount") ?? formData.get("amount") ?? "");
  } else if (funding_source === "bank") {
    bank_amount = Number(formData.get("bank_amount") ?? formData.get("amount") ?? "");
  } else {
    contribution_amount = Number(formData.get("contribution_amount") ?? "");
    bank_amount = Number(formData.get("bank_amount") ?? "");
  }

  if (funding_source === "contribution" || funding_source === "both") {
    if (!Number.isFinite(contribution_amount) || contribution_amount <= 0) {
      fail("Enter how much is drawn from the contribution.");
    }
  } else {
    contribution_amount = 0;
  }

  if (funding_source === "bank" || funding_source === "both") {
    if (!Number.isFinite(bank_amount) || bank_amount <= 0) {
      fail(
        funding_source === "both"
          ? "Enter how much bank money tops up the contribution."
          : "Enter how much is drawn from the bank.",
      );
    }
  } else {
    bank_amount = 0;
  }

  const amount = contribution_amount + bank_amount;
  if (!Number.isFinite(amount) || amount <= 0) {
    fail("Enter an expense amount greater than zero.");
  }

  let allocations: ExpenseAllocation[] = [];
  let payment_request_id: number | null = null;
  let remaining = 0;
  let fullContributionPayout = false;

  if (kind === "member") {
    allocations = parseAllocations(formData);
    if (allocations.length === 0) {
      fail("Select at least one member recipient and amount.");
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

  if (funding_source === "contribution" || funding_source === "both") {
    if (!Number.isFinite(paymentRequestId) || paymentRequestId <= 0) {
      fail("Select which contribution funds this expense.");
    }
    const request = await getPaymentRequestById(paymentRequestId);
    if (!request) fail("That contribution was not found.");

    const options = await listContributionFundingOptions();
    const option = options.find((o) => o.id === paymentRequestId);
    remaining = Number(option?.remaining ?? 0);
    if (!option || remaining <= 0) {
      fail("That contribution has no realised amount left to draw from.");
    }
    if (contribution_amount - remaining > 0.009) {
      fail(
        `Contribution draw cannot exceed the remaining realised amount (${remaining.toFixed(2)}).`,
      );
    }

    payment_request_id = paymentRequestId;
    fullContributionPayout =
      funding_source === "contribution" &&
      Math.abs(contribution_amount - remaining) <= 0.009;

    const expenses = await listAllExpenses();
    const liveRemaining =
      Number(option.realised_total) -
      disbursedFromContribution(expenses, paymentRequestId);
    if (contribution_amount - liveRemaining > 0.009) {
      fail(
        `Contribution draw cannot exceed the remaining realised amount (${Math.max(0, liveRemaining).toFixed(2)}).`,
      );
    }
  }

  const usesBank = bank_amount > 0;
  const partialContribution =
    (funding_source === "contribution" || funding_source === "both") &&
    !fullContributionPayout;
  const notesRequired = usesBank || partialContribution;

  if (notesRequired && notes.length < 3) {
    fail(
      usesBank && partialContribution
        ? "Add notes explaining the bank top-up and why the contribution is not paid out in full."
        : usesBank
          ? "Bank-funded expenses need notes explaining the spend."
          : "Partial contribution payouts need notes explaining why.",
    );
  }

  const storedNotes =
    notes ||
    (fullContributionPayout && payment_request_id
      ? `Full payout of remaining realised amount for contribution #${payment_request_id}.`
      : "");

  await createExpense({
    expense_date,
    amount,
    kind,
    notes: storedNotes,
    allocations,
    funding_source,
    payment_request_id,
    contribution_amount,
    bank_amount,
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
