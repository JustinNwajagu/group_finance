import type {
  ContributionLists,
  Member,
  MemberContribution,
  MemberPaymentRow,
  PaymentRequest,
  PaymentWithMember,
} from "./types";
import { monthsCoveredForMember } from "./dues-data";
import { duesYearFraction } from "./dues-months";
import { compareMembersByName } from "./member-sort";
import {
  expenseIsCertified,
  getMemberById,
  listAllDuesPayments,
  listAllDuesSchedules,
  listAllExpenses,
  listAllMembers,
  listAllPaymentRequestRows,
  listAllPaymentRows,
} from "./store";

const byName = compareMembersByName;

export async function requestedPaymentCount(): Promise<number> {
  return (await listAllPaymentRequestRows()).length;
}

/**
 * Members designated as beneficiaries of a contribution (at open time) or who
 * received a payout funded from that pot are exempt from that title
 * (member id → exempt payment_request ids).
 */
export async function mapContributionExemptionsByMember(): Promise<
  Map<number, Set<number>>
> {
  const [expenses, requests] = await Promise.all([
    listAllExpenses(),
    listAllPaymentRequestRows(),
  ]);
  const out = new Map<number, Set<number>>();

  function exempt(memberId: number, requestId: number) {
    const set = out.get(memberId) ?? new Set<number>();
    set.add(requestId);
    out.set(memberId, set);
  }

  for (const request of requests) {
    if (request.kind !== "member") continue;
    for (const memberId of request.beneficiary_member_ids) {
      if (memberId > 0) exempt(memberId, request.id);
    }
  }

  for (const expense of expenses) {
    const requestId = expense.payment_request_id;
    if (requestId == null || requestId <= 0) continue;
    if (Number(expense.contribution_amount) <= 0.009) continue;
    for (const alloc of expense.allocations) {
      if (!alloc.member_id || Number(alloc.amount) <= 0.009) continue;
      exempt(alloc.member_id, requestId);
    }
  }
  return out;
}

export async function listMembers(query?: string): Promise<MemberContribution[]> {
  const q = query?.trim().toLowerCase() ?? "";
  // Parallel core reads (with shared cache + in-flight coalescing). Skip the
  // dues_payments scan when no dues years are open — common and saves a round trip.
  const [members, requests, payments, schedules, exemptionsByMember] =
    await Promise.all([
      listAllMembers(),
      listAllPaymentRequestRows(),
      listAllPaymentRows(),
      listAllDuesSchedules(),
      mapContributionExemptionsByMember(),
    ]);
  const allDuesPayments =
    schedules.length === 0 ? [] : await listAllDuesPayments();
  const totalTitles = requests.length;
  const duesYearsCount = schedules.length;
  const duesByScheduleMember = new Map<string, typeof allDuesPayments>();
  for (const p of allDuesPayments) {
    const key = `${p.dues_schedule_id}:${p.member_id}`;
    const list = duesByScheduleMember.get(key) ?? [];
    list.push(p);
    duesByScheduleMember.set(key, list);
  }
  const paidRequestIdsByMember = new Map<number, Set<number>>();
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const set = paidRequestIdsByMember.get(p.member_id) ?? new Set<number>();
    set.add(p.payment_request_id);
    paidRequestIdsByMember.set(p.member_id, set);
  }

  return members
    .filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q)
      );
    })
    .map((m) => {
      let duesCount = 0;
      for (const schedule of schedules) {
        const key = `${schedule.id}:${m.id}`;
        const monthsPaid = monthsCoveredForMember(
          duesByScheduleMember.get(key) ?? [],
          schedule.monthly_amount,
        ).filter(Boolean).length;
        duesCount += duesYearFraction(monthsPaid);
      }
      const exempt = exemptionsByMember.get(m.id) ?? new Set<number>();
      const paid = paidRequestIdsByMember.get(m.id) ?? new Set<number>();
      let paidCount = 0;
      for (const requestId of paid) {
        if (!exempt.has(requestId)) paidCount += 1;
      }
      return {
        ...m,
        payment_count: Math.max(0, totalTitles - exempt.size),
        contribution_count: paidCount,
        dues_count: duesCount,
        dues_years_count: duesYearsCount,
      };
    })
    .sort(byName);
}

export async function getMember(id: number): Promise<Member | null> {
  return getMemberById(id);
}

export async function memberContribution(id: number): Promise<string> {
  const payments = await listAllPaymentRows();
  const total = payments
    .filter((p) => p.member_id === id && p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return total.toFixed(2);
}

export async function memberPaymentStats(id: number): Promise<{
  payment_count: number;
  contribution_count: number;
  exemption_count: number;
}> {
  const [totalTitles, payments, exemptionsByMember] = await Promise.all([
    requestedPaymentCount(),
    listAllPaymentRows(),
    mapContributionExemptionsByMember(),
  ]);
  const exempt = exemptionsByMember.get(id) ?? new Set<number>();
  const paidIds = new Set(
    payments
      .filter((p) => p.member_id === id && p.status === "paid")
      .map((p) => p.payment_request_id),
  );
  let contribution_count = 0;
  for (const requestId of paidIds) {
    if (!exempt.has(requestId)) contribution_count += 1;
  }
  return {
    payment_count: Math.max(0, totalTitles - exempt.size),
    contribution_count,
    exemption_count: exempt.size,
  };
}

export type MemberExemptionRow = {
  request_id: number;
  title: string;
  /** Open vs archived contribution title. */
  contribution_status: "open" | "concluded";
  deadline: string;
  concluded_at: string | null;
  /** Designated at open time and/or via a funded expense payout. */
  source: "beneficiary" | "expense" | "both";
  /** Latest contribution-funded receipt for this member on this title, if any. */
  receipt: {
    expense_id: number;
    expense_date: string;
    amount: string;
    certified: boolean;
    certification_count: number;
    notes: string;
    funding_source: string;
    contribution_amount: string;
    bank_amount: string;
  } | null;
};

/** Contribution titles this member is exempt from, with payout stage when known. */
export async function listMemberContributionExemptions(
  memberId: number,
): Promise<MemberExemptionRow[]> {
  const [requests, expenses, exemptionsByMember] = await Promise.all([
    listAllPaymentRequestRows(),
    listAllExpenses(),
    mapContributionExemptionsByMember(),
  ]);
  const exemptIds = exemptionsByMember.get(memberId) ?? new Set<number>();
  if (exemptIds.size === 0) return [];

  const reqById = new Map(requests.map((r) => [r.id, r]));
  const rows: MemberExemptionRow[] = [];

  for (const requestId of [...exemptIds].sort((a, b) => b - a)) {
    const request = reqById.get(requestId);
    if (!request) continue;

    const isBeneficiary =
      request.kind === "member" &&
      request.beneficiary_member_ids.includes(memberId);

    const funded = expenses
      .filter(
        (e) =>
          e.payment_request_id === requestId &&
          Number(e.contribution_amount) > 0.009 &&
          e.allocations.some(
            (a) => a.member_id === memberId && Number(a.amount) > 0.009,
          ),
      )
      .sort((a, b) => {
        const byDate = b.expense_date.localeCompare(a.expense_date);
        if (byDate !== 0) return byDate;
        return b.id - a.id;
      });

    const latest = funded[0] ?? null;
    const alloc = latest?.allocations.find((a) => a.member_id === memberId);
    const hasExpense = latest != null && alloc != null;

    rows.push({
      request_id: request.id,
      title: request.title,
      contribution_status: request.concluded_at ? "concluded" : "open",
      deadline: request.deadline,
      concluded_at: request.concluded_at,
      source: isBeneficiary && hasExpense
        ? "both"
        : isBeneficiary
          ? "beneficiary"
          : "expense",
      receipt:
        latest && alloc
          ? {
              expense_id: latest.id,
              expense_date: latest.expense_date,
              amount: alloc.amount,
              certified: expenseIsCertified(
                latest.certifications,
                latest.certified_at,
              ),
              certification_count: latest.certifications.length,
              notes: latest.notes,
              funding_source: latest.funding_source,
              contribution_amount: latest.contribution_amount,
              bank_amount: latest.bank_amount,
            }
          : null,
    });
  }

  return rows.sort((a, b) => {
    if (a.contribution_status !== b.contribution_status) {
      return a.contribution_status === "open" ? -1 : 1;
    }
    const da = a.receipt?.expense_date ?? a.deadline;
    const db = b.receipt?.expense_date ?? b.deadline;
    return db.localeCompare(da) || b.request_id - a.request_id;
  });
}

export async function listMemberOptions(): Promise<Member[]> {
  return listAllMembers();
}

export async function listOpenPaymentRequests(): Promise<PaymentRequest[]> {
  return (await listAllPaymentRequestRows())
    .filter((r) => !r.concluded_at)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id - b.id);
}


export async function listAllPaymentRequests(): Promise<PaymentRequest[]> {
  return (await listAllPaymentRequestRows()).sort((a, b) => {
    const ao = a.concluded_at ? 1 : 0;
    const bo = b.concluded_at ? 1 : 0;
    if (ao !== bo) return ao - bo;
    // Open: soonest deadline first. Archived: newest concluded first.
    if (a.concluded_at && b.concluded_at) {
      return (
        b.concluded_at.localeCompare(a.concluded_at) ||
        b.deadline.localeCompare(a.deadline) ||
        b.id - a.id
      );
    }
    return a.deadline.localeCompare(b.deadline) || b.id - a.id;
  });
}


function buildContributionLists(
  request: PaymentRequest,
  members: Member[],
  payments: Awaited<ReturnType<typeof listAllPaymentRows>>,
  exemptMemberIds: Set<number> = new Set(),
): ContributionLists {
  const forRequest = payments.filter((p) => p.payment_request_id === request.id);
  const byMember = new Map(forRequest.map((p) => [p.member_id, p]));

  const contributed: MemberPaymentRow[] = [];
  const pledged: MemberPaymentRow[] = [];
  const outstanding: MemberPaymentRow[] = [];

  for (const m of [...members].sort(byName)) {
    const p = byMember.get(m.id);
    if (!p) {
      // Recipients of this contribution pot are exempt — omit from outstanding.
      if (exemptMemberIds.has(m.id)) continue;
      outstanding.push({
        ...m,
        payment_id: null,
        status: null,
        amount: null,
        notes: null,
      });
      continue;
    }
    const row: MemberPaymentRow = {
      ...m,
      payment_id: p.id,
      status: p.status,
      amount: p.amount,
      notes: p.notes,
    };
    if (p.status === "paid") contributed.push(row);
    else pledged.push(row);
  }

  let pledgeTotal = 0;
  let realisedTotal = 0;
  for (const p of forRequest) {
    const n = Number(p.amount);
    if (p.status === "pledge") pledgeTotal += n;
    else if (p.status === "paid") realisedTotal += n;
  }

  return {
    request,
    contributed,
    pledged,
    outstanding,
    pledge_total: pledgeTotal.toFixed(2),
    realised_total: realisedTotal.toFixed(2),
  };
}


export async function listContributionBoards(
  onlyOpen: boolean,
): Promise<ContributionLists[]> {
  const [requests, members, payments, exemptionsByMember] = await Promise.all([
    onlyOpen ? listOpenPaymentRequests() : listAllPaymentRequests(),
    listAllMembers(),
    listAllPaymentRows(),
    mapContributionExemptionsByMember(),
  ]);
  return requests.map((request) => {
    const exemptMemberIds = new Set<number>();
    for (const [memberId, requestIds] of exemptionsByMember) {
      if (requestIds.has(request.id)) exemptMemberIds.add(memberId);
    }
    return buildContributionLists(request, members, payments, exemptMemberIds);
  });
}

export async function listPaymentsForMember(
  id: number,
): Promise<PaymentWithMember[]> {
  const [payments, requests, members] = await Promise.all([
    listAllPaymentRows(),
    listAllPaymentRequestRows(),
    listAllMembers(),
  ]);
  const reqById = new Map(requests.map((r) => [r.id, r]));
  const memById = new Map(members.map((m) => [m.id, m]));
  return payments
    .filter((p) => p.member_id === id)
    .map((p) => {
      const r = reqById.get(p.payment_request_id);
      const m = memById.get(p.member_id);
      return {
        ...p,
        title: r?.title ?? "Payment",
        member_name: m?.name ?? "Member",
      };
    })
    .sort((a, b) => {
      const da = reqById.get(a.payment_request_id)?.deadline ?? "";
      const db = reqById.get(b.payment_request_id)?.deadline ?? "";
      return db.localeCompare(da) || b.created_at.localeCompare(a.created_at);
    });
}

/** Contribution titles this member has not paid (no record, or pledge only). */
export async function listMissedContributionsForMember(memberId: number): Promise<
  Array<{
    id: number;
    title: string;
    amount: string;
    deadline: string;
    concluded: boolean;
    /** null = no record; pledge = recorded but not paid. */
    status: "pledge" | null;
  }>
> {
  const [requests, payments, exemptionsByMember] = await Promise.all([
    listAllPaymentRequests(),
    listAllPaymentRows(),
    mapContributionExemptionsByMember(),
  ]);
  const exempt = exemptionsByMember.get(memberId) ?? new Set<number>();
  const byRequest = new Map(
    payments
      .filter((p) => p.member_id === memberId)
      .map((p) => [p.payment_request_id, p] as const),
  );
  const missed: Array<{
    id: number;
    title: string;
    amount: string;
    deadline: string;
    concluded: boolean;
    status: "pledge" | null;
  }> = [];
  for (const request of requests) {
    if (exempt.has(request.id)) continue;
    const payment = byRequest.get(request.id);
    if (payment?.status === "paid") continue;
    missed.push({
      id: request.id,
      title: request.title,
      amount: request.amount,
      deadline: request.deadline,
      concluded: Boolean(request.concluded_at),
      status: payment?.status === "pledge" ? "pledge" : null,
    });
  }
  return missed;
}

