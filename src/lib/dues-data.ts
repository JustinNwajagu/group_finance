import "server-only";
import { compareMembersByName } from "./member-sort";
import {
  duesYearFraction,
  earliestUnpaidPoint,
  type EarliestUnpaidPoint,
  monthCreditsFromPayments,
  monthsFullyPaidFromCredits,
} from "./dues-months";
import {
  getDuesScheduleById,
  getDuesScheduleByYear,
  listAllDuesPayments,
  listAllDuesSchedules,
  listAllMembers,
  listDuesPaymentsForMember,
  listDuesPaymentsForSchedule,
  type DuesPaymentRow,
  type DuesScheduleRow,
  type MemberRow,
} from "./store";
import type {
  DuesMemberYear,
  DuesPaymentWithMember,
  DuesYearBoard,
} from "./types";

function moneySum(values: Array<string | number>): string {
  let total = 0;
  for (const v of values) total += Number(v);
  return total.toFixed(2);
}

/**
 * Months that are fully paid for a member. Pass the year's monthly due so
 * partial month payments do not count as complete.
 */
export function monthsCoveredForMember(
  payments: DuesPaymentRow[],
  monthlyAmount?: number | string,
): boolean[] {
  const credits = monthCreditsFromPayments(payments);
  return monthsFullyPaidFromCredits(credits, Number(monthlyAmount ?? 0));
}

export function remainingMonths(paid: boolean[]): number {
  return paid.filter((v) => !v).length;
}

function toMemberYear(
  member: MemberRow,
  payments: DuesPaymentRow[],
  monthlyAmount: number | string,
): DuesMemberYear {
  const months_paid = monthsCoveredForMember(payments, monthlyAmount);
  const months_count = months_paid.filter(Boolean).length;
  return {
    member,
    months_paid,
    months_count,
    amount_paid: moneySum(payments.map((p) => p.amount)),
    remaining_months: 12 - months_count,
  };
}


export async function listOpenDuesSchedules(): Promise<DuesScheduleRow[]> {
  const all = await listAllDuesSchedules();
  // Lowest open year first so /dues lands on the earliest tracker still open.
  return all
    .filter((s) => !s.concluded_at)
    .sort((a, b) => a.year - b.year || a.id - b.id);
}

export async function listConcludedDuesSchedules(): Promise<DuesScheduleRow[]> {
  const all = await listAllDuesSchedules();
  return all
    .filter((s) => Boolean(s.concluded_at))
    .sort(
      (a, b) =>
        (b.concluded_at ?? "").localeCompare(a.concluded_at ?? "") ||
        b.year - a.year ||
        b.id - a.id,
    );
}

export async function getDuesBoard(
  scheduleIdOrYear: number,
  byYear = false,
): Promise<DuesYearBoard | null> {
  const schedule = byYear
    ? await getDuesScheduleByYear(scheduleIdOrYear)
    : await getDuesScheduleById(scheduleIdOrYear);
  if (!schedule) return null;

  const [members, payments] = await Promise.all([
    listAllMembers(),
    listDuesPaymentsForSchedule(schedule.id),
  ]);

  const byMember = new Map<number, DuesPaymentRow[]>();
  for (const p of payments) {
    const list = byMember.get(p.member_id) ?? [];
    list.push(p);
    byMember.set(p.member_id, list);
  }

  const memById = new Map(members.map((m) => [m.id, m]));
  const rows = [...members]
    .sort(compareMembersByName)
    .map((m) =>
      toMemberYear(m, byMember.get(m.id) ?? [], schedule.monthly_amount),
    );

  const paymentRows: DuesPaymentWithMember[] = [...payments]
    .sort((a, b) => {
      const byDate = b.payment_date.localeCompare(a.payment_date);
      if (byDate !== 0) return byDate;
      return b.id - a.id;
    })
    .map((p) => ({
      ...p,
      member_name: memById.get(p.member_id)?.name ?? `Member #${p.member_id}`,
      year: schedule.year,
    }));

  return {
    schedule,
    rows,
    payments: paymentRows,
    total_collected: moneySum(payments.map((p) => p.amount)),
  };
}


/**
 * Earliest unpaid dues month per member across all schedules.
 * `null` means every existing year is fully paid for that member.
 */
export async function mapEarliestUnpaidDuesPoints(): Promise<
  Map<number, EarliestUnpaidPoint | null>
> {
  const [schedules, members, payments] = await Promise.all([
    listAllDuesSchedules(),
    listAllMembers(),
    listAllDuesPayments(),
  ]);
  const years = schedules.map((s) => s.year);
  const monthlyByYear = new Map(
    schedules.map((s) => [s.year, Number(s.monthly_amount)]),
  );
  const scheduleYearById = new Map(schedules.map((s) => [s.id, s.year]));
  const paymentsByMember = new Map<number, DuesPaymentRow[]>();
  for (const p of payments) {
    const list = paymentsByMember.get(p.member_id) ?? [];
    list.push(p);
    paymentsByMember.set(p.member_id, list);
  }

  const out = new Map<number, EarliestUnpaidPoint | null>();
  for (const member of members) {
    const memberPayments = paymentsByMember.get(member.id) ?? [];
    const creditsByYear = new Map<number, number[]>();
    for (const schedule of schedules) {
      const forYear = memberPayments.filter(
        (p) =>
          p.dues_schedule_id === schedule.id ||
          scheduleYearById.get(p.dues_schedule_id) === schedule.year,
      );
      creditsByYear.set(schedule.year, monthCreditsFromPayments(forYear));
    }
    out.set(
      member.id,
      years.length === 0
        ? null
        : earliestUnpaidPoint(years, creditsByYear, monthlyByYear),
    );
  }
  return out;
}

/** @deprecated Prefer mapEarliestUnpaidDuesPoints. */
export async function mapEarliestUnpaidDuesYears(): Promise<
  Map<number, number | null>
> {
  const points = await mapEarliestUnpaidDuesPoints();
  return new Map(
    [...points.entries()].map(([id, point]) => [id, point?.year ?? null]),
  );
}

export async function memberDuesSummary(memberId: number): Promise<{
  years_count: number;
  dues_count: number;
  amount_paid: string;
  years: Array<{
    schedule: DuesScheduleRow;
    months_paid: boolean[];
    months_count: number;
    year_fraction: number;
    amount_paid: string;
    remaining_months: number;
    payments: DuesPaymentRow[];
  }>;
}> {
  const [schedules, payments] = await Promise.all([
    listAllDuesSchedules(),
    listDuesPaymentsForMember(memberId),
  ]);
  const years = schedules.map((schedule) => {
    const forYear = payments
      .filter((p) => p.dues_schedule_id === schedule.id)
      .sort((a, b) => {
        const byDate = b.payment_date.localeCompare(a.payment_date);
        if (byDate !== 0) return byDate;
        return b.id - a.id;
      });
    const months_paid = monthsCoveredForMember(
      forYear,
      schedule.monthly_amount,
    );
    const months_count = months_paid.filter(Boolean).length;
    return {
      schedule,
      months_paid,
      months_count,
      year_fraction: duesYearFraction(months_count),
      amount_paid: moneySum(forYear.map((p) => p.amount)),
      remaining_months: 12 - months_count,
      payments: forYear,
    };
  });
  return {
    years_count: years.length,
    dues_count: years.reduce((sum, y) => sum + y.year_fraction, 0),
    amount_paid: moneySum(years.map((y) => y.amount_paid)),
    years,
  };
}
