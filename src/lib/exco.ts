import "server-only";
import {
  getExcoBoard,
  getMemberById,
  getMemberByLoginEmail,
  type ExcoSeatRow,
} from "./store";
import type { ExcoOffice, ExcoSeatView, Member } from "./types";

export const EXCO_OFFICES: ExcoOffice[] = [
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "provost",
];

export const EXCO_LABELS: Record<ExcoOffice, string> = {
  president: "President",
  vice_president: "Vice President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  provost: "Provost",
};

/** Only these offices grant admin rights. */
export const EXCO_ADMIN_OFFICES: readonly ExcoOffice[] = [
  "president",
  "treasurer",
] as const;

/**
 * Current election slate (display names as provided).
 * Alternate match strings cover roster spelling variants.
 */
export const DEFAULT_EXCO_SLATE: {
  office: ExcoOffice;
  holder_name: string;
  match_names: string[];
}[] = [
  {
    office: "president",
    holder_name: "Mr Udeoba Donald Chisom",
    match_names: ["Udeoba Donald Chisom", "Udeoba Donald"],
  },
  {
    office: "vice_president",
    holder_name: "Mr Ozochi Chukwuma",
    match_names: ["Ozochi Chukwuma"],
  },
  {
    office: "secretary",
    holder_name: "Rev Fr. Udeh Stephen",
    match_names: ["Udeh Stephen", "Ude Stephen"],
  },
  {
    office: "treasurer",
    holder_name: "Rev Fr Nwafor Emmanuel",
    match_names: ["Nwafor Emmanuel"],
  },
  {
    office: "provost",
    holder_name: "Mr Ezeiyi Benjamin",
    match_names: ["Ezeiyi Benjamin"],
  },
];

export function isExcoOffice(value: string): value is ExcoOffice {
  return (EXCO_OFFICES as string[]).includes(value);
}

export function officeGrantsAdmin(office: ExcoOffice): boolean {
  return EXCO_ADMIN_OFFICES.includes(office);
}

export function excoLabel(office: ExcoOffice): string {
  return EXCO_LABELS[office];
}

/** Strip titles and punctuation so roster names can match the slate. */
export function personNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|rev|fr|father|engr|barr|sir)\.?\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function namesLikelyMatch(
  memberName: string,
  targetName: string,
): boolean {
  const member = personNameTokens(memberName);
  const target = personNameTokens(targetName);
  if (target.length === 0 || member.length === 0) return false;
  // Every target token must appear in the member name tokens.
  return target.every((token) => member.includes(token));
}

export function matchMemberIdForSlate(
  members: { id: number; name: string }[],
  matchNames: string[],
): number | null {
  for (const target of matchNames) {
    const hit = members.find((m) => namesLikelyMatch(m.name, target));
    if (hit) return hit.id;
  }
  return null;
}


export function toExcoSeatView(
  seat: ExcoSeatRow,
  memberName: string | null,
): ExcoSeatView {
  return {
    office: seat.office,
    member_id: seat.member_id,
    holder_name: seat.holder_name,
    updated_at: seat.updated_at,
    updated_by: seat.updated_by,
    label: excoLabel(seat.office),
    member_name: memberName,
    display_name: memberName || seat.holder_name,
    grants_admin: officeGrantsAdmin(seat.office),
  };
}

export async function listExcoSeatViews(): Promise<ExcoSeatView[]> {
  const board = await getExcoBoard();
  return Promise.all(
    board.seats.map(async (seat) => {
      const member = seat.member_id
        ? await getMemberById(seat.member_id)
        : null;
      return toExcoSeatView(seat, member?.name ?? null);
    }),
  );
}

export async function getExcoSeatForMember(
  memberId: number,
): Promise<ExcoSeatView | null> {
  const seats = await listExcoSeatViews();
  return seats.find((s) => s.member_id === memberId) ?? null;
}

export async function getExcoSeatForEmail(
  email: string,
): Promise<ExcoSeatView | null> {
  const member = await getMemberByLoginEmail(email);
  if (!member) return null;
  return getExcoSeatForMember(member.id);
}

/** True when this login holds President or Treasurer. */
export async function resolveAdminFromExco(email: string): Promise<boolean> {
  const seat = await getExcoSeatForEmail(email);
  return Boolean(seat?.grants_admin);
}

export async function excoByMemberIdMap(): Promise<Map<number, ExcoSeatView>> {
  const seats = await listExcoSeatViews();
  const map = new Map<number, ExcoSeatView>();
  for (const seat of seats) {
    if (seat.member_id != null) map.set(seat.member_id, seat);
  }
  return map;
}

export type MemberWithExco = Member & {
  exco: ExcoSeatView | null;
};
