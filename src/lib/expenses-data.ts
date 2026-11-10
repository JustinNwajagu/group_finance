import "server-only";
import { cache } from "react";
import {
  expenseIsCertified,
  listAllDuesPayments,
  listAllExpenses,
  listAllMembers,
  listAllPaymentRequestRows,
  listAllPaymentRows,
  listExpensesForMember,
  type ExpenseRow,
} from "./store";
import type {
  BankLedgerSummary,
  ContributionFundingOption,
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
  contributionTitles: Map<number, string> = new Map(),
): ExpenseView {
  const allocations: ExpenseAllocationView[] = expense.allocations.map((a) => ({
    ...a,
    member_name: memberNames.get(a.member_id) ?? `Member #${a.member_id}`,
  }));
  const contribution_title =
    expense.payment_request_id != null
      ? (contributionTitles.get(expense.payment_request_id) ??
        `Contribution #${expense.payment_request_id}`)
      : null;
  return {
    ...expense,
    allocations,
    certified: expenseIsCertified(
      expense.certifications,
      expense.certified_at,
    ),
    contribution_title,
  };
}

export function disbursedFromContribution(
  expenses: ExpenseRow[],
  paymentRequestId: number,
): number {
  return expenses
    .filter(
      (e) =>
        e.kind === "member" &&
        e.funding_source === "contribution" &&
        e.payment_request_id === paymentRequestId,
    )
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

export const listContributionFundingOptions = cache(
  async (): Promise<ContributionFundingOption[]> => {
    const [requests, payments, expenses] = await Promise.all([
      listAllPaymentRequestRows(),
      listAllPaymentRows(),
      listAllExpenses(),
    ]);

    const realisedByRequest = new Map<number, number>();
    for (const p of payments) {
      if (p.status !== "paid") continue;
      const n = Number(p.amount);
      if (!Number.isFinite(n)) continue;
      realisedByRequest.set(
        p.payment_request_id,
        (realisedByRequest.get(p.payment_request_id) ?? 0) + n,
      );
    }

    return requests
      .map((request) => {
        const realised = realisedByRequest.get(request.id) ?? 0;
        const disbursed = disbursedFromContribution(expenses, request.id);
        const remaining = Math.max(0, realised - disbursed);
        return {
          id: request.id,
          title: request.title,
          concluded: Boolean(request.concluded_at),
          realised_total: realised.toFixed(2),
          remaining: remaining.toFixed(2),
        } satisfies ContributionFundingOption;
      })
      .filter((row) => Number(row.realised_total) > 0)
      .sort((a, b) => {
        if (a.concluded !== b.concluded) return a.concluded ? -1 : 1;
        return b.id - a.id;
      });
  },
);

export const listExpenseViews = cache(async (): Promise<ExpenseView[]> => {
  const [expenses, members, requests] = await Promise.all([
    listAllExpenses(),
    listAllMembers(),
    listAllPaymentRequestRows(),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const titles = new Map(requests.map((r) => [r.id, r.title]));
  return expenses.map((e) => toExpenseView(e, names, titles));
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
  const [rows, members, requests] = await Promise.all([
    listExpensesForMember(memberId),
    listAllMembers(),
    listAllPaymentRequestRows(),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const titles = new Map(requests.map((r) => [r.id, r.title]));
  return rows
    .map((expense) => {
      const alloc = expense.allocations.find((a) => a.member_id === memberId);
      if (!alloc) return null;
      return {
        expense: toExpenseView(expense, names, titles),
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
