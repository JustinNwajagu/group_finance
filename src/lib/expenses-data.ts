import "server-only";
import { cache } from "react";
import {
  expenseIsCertified,
  listAllDuesPayments,
  listAllExpenses,
  listAllMembers,
  listAllPaymentRows,
  listExpensesForMember,
  type ExpenseRow,
} from "./store";
import type {
  BankLedgerSummary,
  ExpenseAllocationView,
  ExpenseView,
} from "./types";

function moneySum(values: Iterable<string | number>): string {
  let total = 0;
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) total += n;
  }
  return total.toFixed(2);
}

export function toExpenseView(
  expense: ExpenseRow,
  memberNames: Map<number, string>,
): ExpenseView {
  const allocations: ExpenseAllocationView[] = expense.allocations.map((a) => ({
    ...a,
    member_name: memberNames.get(a.member_id) ?? `Member #${a.member_id}`,
  }));
  return {
    ...expense,
    allocations,
    certified: expenseIsCertified(
      expense.certifications,
      expense.certified_at,
    ),
  };
}

export const listExpenseViews = cache(async (): Promise<ExpenseView[]> => {
  const [expenses, members] = await Promise.all([
    listAllExpenses(),
    listAllMembers(),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  return expenses.map((e) => toExpenseView(e, names));
});

export const getBankLedgerSummary = cache(
  async (): Promise<BankLedgerSummary> => {
    const [payments, dues, expenses] = await Promise.all([
      listAllPaymentRows(),
      listAllDuesPayments(),
      listAllExpenses(),
    ]);

    const contributions_in = moneySum(
      payments.filter((p) => p.status === "paid").map((p) => p.amount),
    );
    const dues_in = moneySum(dues.map((p) => p.amount));
    const certified = expenses.filter((e) =>
      expenseIsCertified(e.certifications, e.certified_at),
    );
    const pending = expenses.filter(
      (e) => !expenseIsCertified(e.certifications, e.certified_at),
    );
    const expenses_out = moneySum(certified.map((e) => e.amount));
    const pending_expenses = moneySum(pending.map((e) => e.amount));
    const balance = (
      Number(contributions_in) +
      Number(dues_in) -
      Number(expenses_out)
    ).toFixed(2);

    return {
      contributions_in,
      dues_in,
      expenses_out,
      pending_expenses,
      balance,
    };
  },
);

export async function listMemberExpenseReceipts(memberId: number): Promise<
  Array<{
    expense: ExpenseView;
    amount: string;
  }>
> {
  const [rows, members] = await Promise.all([
    listExpensesForMember(memberId),
    listAllMembers(),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  return rows
    .map((expense) => {
      const alloc = expense.allocations.find((a) => a.member_id === memberId);
      if (!alloc) return null;
      return {
        expense: toExpenseView(expense, names),
        amount: alloc.amount,
      };
    })
    .filter((row): row is { expense: ExpenseView; amount: string } => row != null)
    .sort((a, b) => {
      const byDate = b.expense.expense_date.localeCompare(a.expense.expense_date);
      if (byDate !== 0) return byDate;
      return b.expense.id - a.expense.id;
    });
}
