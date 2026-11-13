"use client";

import { RecordDuesForm } from "@/components/record-dues-form";
import type { DuesSchedule, Member } from "@/lib/types";

type BoardMeta = {
  schedule: DuesSchedule;
  remainingByMember: Record<number, number>;
};

type EarliestPoint = { year: number; month: number } | null;

export function AmendArchivedDuesForm({
  action,
  boards,
  members,
  today,
  earliestUnpaidByMember = {},
}: {
  action: (formData: FormData) => Promise<void>;
  /** @deprecated Year is chosen automatically; kept for call-site compat. */
  schedules?: DuesSchedule[];
  boards: BoardMeta[];
  members: Member[];
  today: string;
  /** Member id → earliest unpaid dues month (null when fully paid). */
  earliestUnpaidByMember?: Record<number, EarliestPoint>;
}) {
  // Anchor on the newest concluded board; allocation still starts from each
  // member's earliest unpaid year regardless of this schedule.
  const selected = boards[0] ?? null;

  if (!selected) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No concluded dues years to amend yet.
      </p>
    );
  }

  return (
    <RecordDuesForm
      key={selected.schedule.id}
      action={action}
      scheduleId={selected.schedule.id}
      currentYear={selected.schedule.year}
      monthly={Number(selected.schedule.monthly_amount)}
      today={today}
      returnTo="/archive"
      members={members.map((m) => {
        const point = earliestUnpaidByMember[m.id] ?? null;
        return {
          id: m.id,
          name: m.name,
          remainingInCurrentYear: selected.remainingByMember[m.id] ?? 12,
          earliestUnpaidYear: point?.year ?? null,
          earliestUnpaidMonth: point?.month ?? null,
        };
      })}
    />
  );
}
