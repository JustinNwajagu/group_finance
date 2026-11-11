"use client";

import { useMemo, useState } from "react";
import { RecordDuesForm } from "@/components/record-dues-form";
import { formatDate, formatMoney } from "@/lib/format";
import type { DuesSchedule, Member } from "@/lib/types";

type BoardMeta = {
  schedule: DuesSchedule;
  remainingByMember: Record<number, number>;
};

export function AmendArchivedDuesForm({
  action,
  schedules,
  boards,
  members,
  today,
}: {
  action: (formData: FormData) => Promise<void>;
  schedules: DuesSchedule[];
  boards: BoardMeta[];
  members: Member[];
  today: string;
}) {
  const [scheduleId, setScheduleId] = useState(
    schedules[0] ? String(schedules[0].id) : "",
  );

  const selected = useMemo(
    () => boards.find((b) => String(b.schedule.id) === scheduleId) ?? null,
    [boards, scheduleId],
  );

  if (schedules.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No concluded dues years to amend yet.
      </p>
    );
  }

  const yearOptions = schedules.map((s) => s.year);

  return (
    <div className="stack" style={{ gap: "0.85rem" }}>
      <label className="field">
        Concluded dues year
        <select
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
        >
          {schedules.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title || `${s.year} dues`} · deadline{" "}
              {formatDate(s.deadline)}
              {s.concluded_at
                ? ` · concluded ${formatDate(s.concluded_at.slice(0, 10))}`
                : ""}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Monthly {formatMoney(selected.schedule.monthly_amount)}. Recording
            here updates the archived year the same way as open dues.
          </p>
          <RecordDuesForm
            action={action}
            scheduleId={selected.schedule.id}
            currentYear={selected.schedule.year}
            monthly={Number(selected.schedule.monthly_amount)}
            today={today}
            yearOptions={yearOptions}
            returnTo="/archive"
            members={members.map((m) => ({
              id: m.id,
              name: m.name,
              remainingInCurrentYear:
                selected.remainingByMember[m.id] ?? 12,
            }))}
          />
        </>
      ) : null}
    </div>
  );
}
