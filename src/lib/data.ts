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
  getMemberById,
  getPaymentRequestById,
  listAllDuesPayments,
  listAllDuesSchedules,
  listAllMembers,
  listAllPaymentRequestRows,
  listAllPaymentRows,
} from "./store";

const byName = compareMembersByName;

export async function requestedPaymentCount(): Promise<number> {
  return (await listAllPaymentRequestRows()).length;
}

export async function listMembers(query?: string): Promise<MemberContribution[]> {
  const q = query?.trim().toLowerCase() ?? "";
  // Parallel core reads (with shared cache + in-flight coalescing). Skip the
  // dues_payments scan when no dues years are open — common and saves a round trip.
  const [members, requests, payments, schedules] = await Promise.all([
    listAllMembers(),
    listAllPaymentRequestRows(),
    listAllPaymentRows(),
    listAllDuesSchedules(),
  ]);
  const allDuesPayments =
    schedules.length === 0 ? [] : await listAllDuesPayments();
  const paymentCount = requests.length;
  const duesYearsCount = schedules.length;
  const duesByScheduleMember = new Map<string, typeof allDuesPayments>();
  for (const p of allDuesPayments) {
    const key = `${p.dues_schedule_id}:${p.member_id}`;
    const list = duesByScheduleMember.get(key) ?? [];
    list.push(p);
    duesByScheduleMember.set(key, list);
  }
  const paidContributionCountByMember = new Map<number, number>();
  for (const p of payments) {
    if (p.status !== "paid") continue;
    paidContributionCountByMember.set(
      p.member_id,
      (paidContributionCountByMember.get(p.member_id) ?? 0) + 1,
    );
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
      return {
        ...m,
        payment_count: paymentCount,
        contribution_count: paidContributionCountByMember.get(m.id) ?? 0,
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
}> {
  const [payment_count, payments] = await Promise.all([
    requestedPaymentCount(),
    listAllPaymentRows(),
  ]);
  return {
    payment_count,
    contribution_count: payments.filter(
      (p) => p.member_id === id && p.status === "paid",
    ).length,
  };
}

export async function listMemberOptions(): Promise<Member[]> {
  return listAllMembers();
}

export async function listOpenPaymentRequests(): Promise<PaymentRequest[]> {
  return (await listAllPaymentRequestRows())
    .filter((r) => !r.concluded_at)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id - b.id);
}

export async function listConcludedPaymentRequests(): Promise<PaymentRequest[]> {
  return (await listAllPaymentRequestRows())
    .filter((r) => r.concluded_at)
    .sort((a, b) =>
      (b.concluded_at ?? "").localeCompare(a.concluded_at ?? ""),
    );
}

export async function listAllPaymentRequests(): Promise<PaymentRequest[]> {
  return (await listAllPaymentRequestRows()).sort((a, b) => {
    const ao = a.concluded_at ? 1 : 0;
    const bo = b.concluded_at ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return a.deadline.localeCompare(b.deadline) || b.id - a.id;
  });
}

export async function getPaymentRequest(
  id: number,
): Promise<PaymentRequest | null> {
  return getPaymentRequestById(id);
}

function buildContributionLists(
  request: PaymentRequest,
  members: Member[],
  payments: Awaited<ReturnType<typeof listAllPaymentRows>>,
): ContributionLists {
  const forRequest = payments.filter((p) => p.payment_request_id === request.id);
  const byMember = new Map(forRequest.map((p) => [p.member_id, p]));

  const contributed: MemberPaymentRow[] = [];
  const pledged: MemberPaymentRow[] = [];
  const outstanding: MemberPaymentRow[] = [];

  for (const m of [...members].sort(byName)) {
    const p = byMember.get(m.id);
    if (!p) {
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

export async function contributionListsForRequest(
  requestId: number,
): Promise<ContributionLists | null> {
  const request = await getPaymentRequest(requestId);
  if (!request) return null;

  const [members, payments] = await Promise.all([
    listAllMembers(),
    listAllPaymentRows(),
  ]);
  return buildContributionLists(request, members, payments);
}

export async function listContributionBoards(
  onlyOpen: boolean,
): Promise<ContributionLists[]> {
  const [requests, members, payments] = await Promise.all([
    onlyOpen ? listOpenPaymentRequests() : listAllPaymentRequests(),
    listAllMembers(),
    listAllPaymentRows(),
  ]);
  return requests.map((request) =>
    buildContributionLists(request, members, payments),
  );
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

export async function listPayments(
  query?: string,
): Promise<PaymentWithMember[]> {
  const q = query?.trim().toLowerCase() ?? "";
  const [payments, requests, members] = await Promise.all([
    listAllPaymentRows(),
    listAllPaymentRequestRows(),
    listAllMembers(),
  ]);
  const reqById = new Map(requests.map((r) => [r.id, r]));
  const memById = new Map(members.map((m) => [m.id, m]));
  return payments
    .map((p) => {
      const r = reqById.get(p.payment_request_id);
      const m = memById.get(p.member_id);
      return {
        ...p,
        title: r?.title ?? "Payment",
        member_name: m?.name ?? "Member",
      };
    })
    .filter((p) => {
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.member_name.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const da = reqById.get(a.payment_request_id)?.deadline ?? "";
      const db = reqById.get(b.payment_request_id)?.deadline ?? "";
      return db.localeCompare(da) || b.created_at.localeCompare(a.created_at);
    })
    .slice(0, 500);
}
