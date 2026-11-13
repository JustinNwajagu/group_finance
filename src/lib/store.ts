import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { isFirestore } from "./config";
import { normalizePaymentTitle } from "./format";
import { cachedLoad, invalidateStoreCache } from "./firestore-cache";
import { withFirestoreRetry } from "./firestore-retry";
import { compareMembersByName } from "./member-sort";
import {
  defaultRegulationsDoc,
  normalizeRegulationsDoc,
  type RegulationsDoc,
} from "./regulations";
import type {
  BankAccountDetails,
  ExcoBoard,
  ExcoOffice,
  ExcoSeat,
  ExpenseAllocation,
  ExpenseCertification,
  ExpenseFundingSource,
  ExpenseKind,
  PaymentStatus,
} from "./types";

export type MemberRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  /** Firebase Auth uid when this roster member has a login. */
  auth_uid: string | null;
  /** Login email if different from contact email. */
  login_email: string | null;
  created_at: string;
};

/** Contribution request — kept separate from dues_schedules. */
export type PaymentRequestRow = {
  id: number;
  title: string;
  amount: string;
  deadline: string;
  concluded_at: string | null;
  /** Amount of realised funds released to general bank (not expense outflow). */
  released_to_bank: string;
  created_at: string;
};

/** Contribution payment — kept separate from dues_payments. */
export type PaymentRow = {
  id: number;
  payment_request_id: number;
  member_id: number;
  amount: string;
  payment_date: string | null;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
};

export type DuesScheduleRow = {
  id: number;
  year: number;
  /** Display title — often from an uploaded document name. */
  title: string;
  monthly_amount: string;
  /** Last day members are expected to pay for this year. */
  deadline: string;
  concluded_at: string | null;
  created_at: string;
};

export type DuesPaymentRow = {
  id: number;
  dues_schedule_id: number;
  member_id: number;
  amount: string;
  covered_months: number[];
  payment_date: string;
  notes: string | null;
  created_at: string;
};

export type ExpenseRow = {
  id: number;
  expense_date: string;
  amount: string;
  kind: ExpenseKind;
  notes: string;
  allocations: ExpenseAllocation[];
  funding_source: ExpenseFundingSource;
  payment_request_id: number | null;
  contribution_amount: string;
  bank_amount: string;
  certifications: ExpenseCertification[];
  created_by_email: string;
  created_by_name: string;
  created_at: string;
  certified_at: string | null;
};

function normalizeNotes(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Default group bank details (editable by admins on Expenses). */
const DEFAULT_BANK: BankAccountDetails = {
  bank_name: "UBA",
  account_name: "Klef 2013",
  account_number: "2280781660",
  bank_code: "",
  updated_at: null,
  updated_by: null,
};

export type ExcoSeatRow = ExcoSeat;

const DEFAULT_EXCO_BOARD: ExcoBoard = {
  seats: [
    {
      office: "president",
      member_id: null,
      holder_name: "Mr Udeoba Donald Chisom",
      updated_at: null,
      updated_by: null,
    },
    {
      office: "vice_president",
      member_id: null,
      holder_name: "Mr Ozochi Chukwuma",
      updated_at: null,
      updated_by: null,
    },
    {
      office: "secretary",
      member_id: null,
      holder_name: "Rev Fr. Udeh Stephen",
      updated_at: null,
      updated_by: null,
    },
    {
      office: "treasurer",
      member_id: null,
      holder_name: "Rev Fr Nwafor Emmanuel",
      updated_at: null,
      updated_by: null,
    },
    {
      office: "provost",
      member_id: null,
      holder_name: "Mr Ezeiyi Benjamin",
      updated_at: null,
      updated_by: null,
    },
  ],
  updated_at: null,
  updated_by: null,
};

type LocalDb = {
  counters: {
    members: number;
    payment_requests: number;
    payments: number;
    dues_schedules: number;
    dues_payments: number;
    expenses: number;
  };
  members: MemberRow[];
  payment_requests: PaymentRequestRow[];
  payments: PaymentRow[];
  dues_schedules: DuesScheduleRow[];
  dues_payments: DuesPaymentRow[];
  expenses: ExpenseRow[];
  bank_account: BankAccountDetails;
  exco: ExcoBoard;
  regulations: RegulationsDoc;
};

type GlobalStore = typeof globalThis & {
  __klefLocalDb?: LocalDb;
  __klefLocalDbWrite?: Promise<void>;
};

function emptyLocal(): LocalDb {
  return {
    counters: {
      members: 0,
      payment_requests: 0,
      payments: 0,
      dues_schedules: 0,
      dues_payments: 0,
      expenses: 0,
    },
    members: [],
    payment_requests: [],
    payments: [],
    dues_schedules: [],
    dues_payments: [],
    expenses: [],
    bank_account: { ...DEFAULT_BANK },
    exco: {
      seats: DEFAULT_EXCO_BOARD.seats.map((s) => ({ ...s })),
      updated_at: null,
      updated_by: null,
    },
    regulations: defaultRegulationsDoc(),
  };
}

function normalizeExcoBoard(
  raw: Record<string, unknown> | ExcoBoard | null | undefined,
): ExcoBoard {
  const seatsRaw = Array.isArray((raw as ExcoBoard | null)?.seats)
    ? ((raw as ExcoBoard).seats as ExcoSeat[])
    : Array.isArray((raw as { seats?: unknown } | null)?.seats)
      ? (((raw as { seats: unknown }).seats as ExcoSeat[]) ?? [])
      : [];
  const byOffice = new Map<ExcoOffice, ExcoSeat>();
  for (const seat of seatsRaw) {
    if (!seat || typeof seat !== "object") continue;
    const office = String((seat as ExcoSeat).office ?? "") as ExcoOffice;
    if (
      office !== "president" &&
      office !== "vice_president" &&
      office !== "secretary" &&
      office !== "treasurer" &&
      office !== "provost"
    ) {
      continue;
    }
    const memberRaw = (seat as ExcoSeat).member_id;
    const member_id =
      memberRaw == null || memberRaw === ("" as unknown)
        ? null
        : Number(memberRaw);
    byOffice.set(office, {
      office,
      member_id:
        member_id != null && Number.isFinite(member_id) && member_id > 0
          ? member_id
          : null,
      holder_name: String((seat as ExcoSeat).holder_name ?? "").trim(),
      updated_at: ((seat as ExcoSeat).updated_at as string | null) ?? null,
      updated_by: ((seat as ExcoSeat).updated_by as string | null) ?? null,
    });
  }
  const seats = DEFAULT_EXCO_BOARD.seats.map((fallback) => {
    const existing = byOffice.get(fallback.office);
    if (!existing) return { ...fallback };
    return {
      ...fallback,
      ...existing,
      holder_name: existing.holder_name || fallback.holder_name,
    };
  });
  return {
    seats,
    updated_at: ((raw as ExcoBoard | null)?.updated_at as string | null) ?? null,
    updated_by: ((raw as ExcoBoard | null)?.updated_by as string | null) ?? null,
  };
}

/** Backfill fields if an older local-store.json is missing newer collections. */
function normalizeLocal(db: LocalDb): LocalDb {
  db.counters.dues_schedules ??= 0;
  db.counters.dues_payments ??= 0;
  db.counters.expenses ??= 0;
  db.dues_schedules ??= [];
  db.dues_payments ??= [];
  db.expenses ??= [];
  const existingBank = db.bank_account ?? null;
  const hasBankDetails = Boolean(
    existingBank &&
      (existingBank.bank_name ||
        existingBank.account_name ||
        existingBank.account_number),
  );
  db.bank_account = hasBankDetails
    ? { ...DEFAULT_BANK, ...existingBank }
    : { ...DEFAULT_BANK };
  db.exco = normalizeExcoBoard(db.exco);
  db.regulations = normalizeRegulationsDoc(db.regulations);
  return db;
}

const dataFile = () => path.join(process.cwd(), "data", "local-store.json");

async function loadLocal(): Promise<LocalDb> {
  const g = globalThis as GlobalStore;
  if (g.__klefLocalDb) return normalizeLocal(g.__klefLocalDb);
  try {
    const raw = await readFile(dataFile(), "utf8");
    g.__klefLocalDb = normalizeLocal(JSON.parse(raw) as LocalDb);
  } catch {
    g.__klefLocalDb = emptyLocal();
  }
  return g.__klefLocalDb;
}

async function saveLocal(db: LocalDb): Promise<void> {
  const g = globalThis as GlobalStore;
  g.__klefLocalDb = db;
  await mkdir(path.dirname(dataFile()), { recursive: true });
  g.__klefLocalDbWrite = writeFile(dataFile(), JSON.stringify(db, null, 2));
  await g.__klefLocalDbWrite;
}

function nowIso() {
  return new Date().toISOString();
}

function money(n: number | string) {
  return Number(n).toFixed(2);
}

async function nextLocalId(
  db: LocalDb,
  key: keyof LocalDb["counters"],
): Promise<number> {
  db.counters[key] += 1;
  return db.counters[key];
}

async function firestoreNextId(collection: string): Promise<number> {
  const db = adminDb()!;
  const ref = db.collection("_counters").doc(collection);
  const id = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
    const next = current + 1;
    tx.set(ref, { value: next }, { merge: true });
    return next;
  });
  return id;
}

/** Skip bootstrap markers / non-row docs in Firestore collections. */
function isAppRow(data: Record<string, unknown> | undefined): boolean {
  if (!data || data._meta === true) return false;
  return Number.isFinite(Number(data.id));
}

export async function storeBackend(): Promise<"firestore" | "local"> {
  return isFirestore() ? "firestore" : "local";
}

export async function createMember(input: {
  name: string;
  email: string | null;
  phone?: string | null;
}): Promise<MemberRow> {
  const created_at = nowIso();
  const { ensureLeadingTitleDot } = await import("./name-titles");
  const rowBase = {
    name: ensureLeadingTitleDot(input.name.trim()),
    email: input.email,
    phone: input.phone?.trim() || null,
    auth_uid: null as string | null,
    login_email: null as string | null,
    created_at,
  };
  if (isFirestore()) {
    const id = await firestoreNextId("members");
    const row: MemberRow = { id, ...rowBase };
    await adminDb()!
      .collection("members")
      .doc(String(id))
      .set({
        ...row,
        // Native Firestore timestamp kept alongside ISO string for console/queries.
        created_at_ts: FieldValue.serverTimestamp(),
      });
    invalidateStoreCache();
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "members");
  const row: MemberRow = { id, ...rowBase };
  db.members.push(row);
  await saveLocal(db);
  invalidateStoreCache();
  return row;
}

export async function updateMemberRow(
  id: number,
  patch: Partial<
    Pick<MemberRow, "name" | "email" | "phone" | "auth_uid" | "login_email">
  >,
): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  if (isFirestore()) {
    await adminDb()!
      .collection("members")
      .doc(String(id))
      .set(patch, { merge: true });
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  const row = db.members.find((m) => m.id === id);
  if (!row) return;
  Object.assign(row, patch);
  await saveLocal(db);
  invalidateStoreCache();
}

/** Remove login linkage fields from a roster member (Auth account may be deleted separately). */
export async function clearMemberLoginLink(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  if (isFirestore()) {
    await adminDb()!
      .collection("members")
      .doc(String(id))
      .update({
        auth_uid: FieldValue.delete(),
        login_email: FieldValue.delete(),
      });
    invalidateStoreCache();
    return;
  }
  await updateMemberRow(id, { auth_uid: null, login_email: null });
}

export async function deleteMemberRow(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  if (isFirestore()) {
    await adminDb()!.collection("members").doc(String(id)).delete();
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  db.members = db.members.filter((m) => m.id !== id);
  await saveLocal(db);
  invalidateStoreCache();
}

function memberHasLinkedLogin(m: MemberRow): boolean {
  return Boolean(m.auth_uid) || Boolean((m.login_email || "").trim());
}

/** Roster members that do not yet have a linked login. */
export async function listMembersWithoutLogin(): Promise<MemberRow[]> {
  return (await listAllMembers()).filter((m) => !memberHasLinkedLogin(m));
}

/** Roster members that currently have a linked login. */
export async function listMembersWithLogin(): Promise<MemberRow[]> {
  return (await listAllMembers()).filter((m) => memberHasLinkedLogin(m));
}

/** Find a roster member linked to a login / contact email. */
export async function getMemberByLoginEmail(
  email: string,
): Promise<MemberRow | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const members = await listAllMembers();
  return (
    members.find((m) => {
      const login = (m.login_email ?? "").trim().toLowerCase();
      const contact = (m.email ?? "").trim().toLowerCase();
      return login === normalized || contact === normalized;
    }) ?? null
  );
}

export async function countMembers(): Promise<number> {
  return (await listAllMembers()).length;
}

export async function countLinkedLogins(): Promise<number> {
  return (await listAllMembers()).filter((m) => memberHasLinkedLogin(m)).length;
}

function coerceCreatedAt(raw: Record<string, unknown>): string {
  const value = raw.created_at;
  if (typeof value === "string" && value) return value;
  // Firestore Timestamp (admin SDK)
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  const ts = raw.created_at_ts;
  if (
    ts &&
    typeof ts === "object" &&
    typeof (ts as { toDate?: () => Date }).toDate === "function"
  ) {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function normalizeMember(raw: Record<string, unknown>): MemberRow | null {
  if (!isAppRow(raw)) return null;
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    email: (raw.email as string | null) ?? null,
    phone: (raw.phone as string | null) ?? null,
    auth_uid: (raw.auth_uid as string | null) ?? null,
    login_email: (raw.login_email as string | null) ?? null,
    created_at: coerceCreatedAt(raw),
  };
}

export const listAllMembers = cache(async (): Promise<MemberRow[]> => {
  return cachedLoad("members", async () => {
    if (isFirestore()) {
      const snap = await withFirestoreRetry("members.get", () =>
        adminDb()!.collection("members").get(),
      );
      return snap.docs
        .map((d) => normalizeMember(d.data() as Record<string, unknown>))
        .filter((d): d is MemberRow => d != null)
        .sort(compareMembersByName);
    }
    const db = await loadLocal();
    return [...db.members]
      .map((m) => normalizeMember(m as unknown as Record<string, unknown>)!)
      .filter(Boolean)
      .sort(compareMembersByName);
  });
});

export async function getMemberById(id: number): Promise<MemberRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (isFirestore()) {
    const snap = await adminDb()!.collection("members").doc(String(id)).get();
    if (!snap.exists) return null;
    return normalizeMember(snap.data() as Record<string, unknown>);
  }
  const db = await loadLocal();
  const found = db.members.find((m) => m.id === id);
  return found
    ? normalizeMember(found as unknown as Record<string, unknown>)
    : null;
}

function normalizePaymentRequest(
  raw: Record<string, unknown>,
): PaymentRequestRow | null {
  if (!isAppRow(raw)) return null;
  // Skip legacy dues rows that may still sit in payment_requests.
  if (raw.type === "dues") return null;
  return {
    id: Number(raw.id),
    title: normalizePaymentTitle(String(raw.title ?? "")),
    amount: money(raw.amount as string | number),
    deadline: String(raw.deadline ?? ""),
    concluded_at: (raw.concluded_at as string | null) ?? null,
    released_to_bank: money(Number(raw.released_to_bank ?? 0)),
    created_at: String(raw.created_at ?? nowIso()),
  };
}

function normalizePayment(raw: Record<string, unknown>): PaymentRow | null {
  if (!isAppRow(raw)) return null;
  if (raw.type === "dues") return null;
  return {
    id: Number(raw.id),
    payment_request_id: Number(raw.payment_request_id),
    member_id: Number(raw.member_id),
    amount: money(raw.amount as string | number),
    payment_date: (raw.payment_date as string | null) ?? null,
    status: raw.status === "paid" ? "paid" : "pledge",
    notes: normalizeNotes(raw.notes),
    created_at: String(raw.created_at ?? nowIso()),
  };
}

export async function createPaymentRequestRow(input: {
  title: string;
  amount: number;
  deadline: string;
  /** When set, the contribution is closed and appears in Archive. */
  concluded_at?: string | null;
}): Promise<PaymentRequestRow> {
  const created_at = nowIso();
  const rowBase = {
    title: normalizePaymentTitle(input.title),
    amount: money(input.amount),
    deadline: input.deadline,
    concluded_at: input.concluded_at ?? null,
    released_to_bank: money(0),
    created_at,
  };
  if (isFirestore()) {
    const id = await firestoreNextId("payment_requests");
    const row: PaymentRequestRow = { id, ...rowBase };
    await adminDb()!.collection("payment_requests").doc(String(id)).set(row);
    invalidateStoreCache();
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "payment_requests");
  const row: PaymentRequestRow = { id, ...rowBase };
  db.payment_requests.push(row);
  await saveLocal(db);
  invalidateStoreCache();
  return row;
}

export const listAllPaymentRequestRows = cache(
  async (): Promise<PaymentRequestRow[]> => {
    return cachedLoad("payment_requests", async () => {
      if (isFirestore()) {
        const snap = await withFirestoreRetry("payment_requests.get", () =>
          adminDb()!.collection("payment_requests").get(),
        );
        return snap.docs
          .map((d) =>
            normalizePaymentRequest(d.data() as Record<string, unknown>),
          )
          .filter((d): d is PaymentRequestRow => d != null);
      }
      const db = await loadLocal();
      return db.payment_requests
        .map((r) =>
          normalizePaymentRequest(r as unknown as Record<string, unknown>),
        )
        .filter((d): d is PaymentRequestRow => d != null);
    });
  },
);

export async function getPaymentRequestById(
  id: number,
): Promise<PaymentRequestRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (isFirestore()) {
    const snap = await adminDb()!
      .collection("payment_requests")
      .doc(String(id))
      .get();
    if (!snap.exists) return null;
    return normalizePaymentRequest(snap.data() as Record<string, unknown>);
  }
  const db = await loadLocal();
  const found = db.payment_requests.find((r) => r.id === id);
  return found
    ? normalizePaymentRequest(found as unknown as Record<string, unknown>)
    : null;
}

export async function updatePaymentRequestRow(
  id: number,
  patch: Partial<
    Pick<PaymentRequestRow, "concluded_at" | "title" | "released_to_bank">
  >,
): Promise<void> {
  const cleaned = { ...patch };
  if (cleaned.released_to_bank != null) {
    cleaned.released_to_bank = money(cleaned.released_to_bank);
  }
  if (isFirestore()) {
    await adminDb()!
      .collection("payment_requests")
      .doc(String(id))
      .set(cleaned, { merge: true });
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  const row = db.payment_requests.find((r) => r.id === id);
  if (!row) return;
  Object.assign(row, cleaned);
  await saveLocal(db);
  invalidateStoreCache();
}

export const listAllPaymentRows = cache(async (): Promise<PaymentRow[]> => {
  return cachedLoad("payments", async () => {
    if (isFirestore()) {
      const snap = await withFirestoreRetry("payments.get", () =>
        adminDb()!.collection("payments").get(),
      );
      return snap.docs
        .map((d) => normalizePayment(d.data() as Record<string, unknown>))
        .filter((d): d is PaymentRow => d != null);
    }
    const db = await loadLocal();
    return db.payments
      .map((r) => normalizePayment(r as unknown as Record<string, unknown>))
      .filter((d): d is PaymentRow => d != null);
  });
});

export async function getPaymentById(id: number): Promise<PaymentRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (isFirestore()) {
    const snap = await adminDb()!.collection("payments").doc(String(id)).get();
    if (!snap.exists) return null;
    return normalizePayment(snap.data() as Record<string, unknown>);
  }
  const db = await loadLocal();
  const found = db.payments.find((p) => p.id === id);
  return found
    ? normalizePayment(found as unknown as Record<string, unknown>)
    : null;
}

export async function findPaymentForMemberRequest(
  paymentRequestId: number,
  memberId: number,
): Promise<PaymentRow | null> {
  if (isFirestore()) {
    const snap = await adminDb()!
      .collection("payments")
      .where("payment_request_id", "==", paymentRequestId)
      .where("member_id", "==", memberId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return normalizePayment(snap.docs[0].data() as Record<string, unknown>);
  }
  const db = await loadLocal();
  const found = db.payments.find(
    (p) =>
      p.payment_request_id === paymentRequestId && p.member_id === memberId,
  );
  return found
    ? normalizePayment(found as unknown as Record<string, unknown>)
    : null;
}

export async function createPaymentRow(input: {
  payment_request_id: number;
  member_id: number;
  amount: number | string;
  status: PaymentStatus;
  payment_date: string | null;
  notes?: string | null;
}): Promise<PaymentRow> {
  const created_at = nowIso();
  const base = {
    payment_request_id: input.payment_request_id,
    member_id: input.member_id,
    amount: money(input.amount),
    status: input.status,
    payment_date: input.payment_date,
    notes: normalizeNotes(input.notes ?? null),
    created_at,
  };
  if (isFirestore()) {
    const id = await firestoreNextId("payments");
    const row: PaymentRow = { id, ...base };
    await adminDb()!.collection("payments").doc(String(id)).set(row);
    invalidateStoreCache();
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "payments");
  const row: PaymentRow = { id, ...base };
  db.payments.push(row);
  await saveLocal(db);
  invalidateStoreCache();
  return row;
}

export async function updatePaymentRow(
  id: number,
  patch: Partial<
    Pick<PaymentRow, "amount" | "status" | "payment_date" | "notes">
  >,
): Promise<void> {
  const cleaned = { ...patch };
  if (cleaned.amount != null) cleaned.amount = money(cleaned.amount);
  if ("notes" in cleaned) cleaned.notes = normalizeNotes(cleaned.notes ?? null);
  if (isFirestore()) {
    await adminDb()!
      .collection("payments")
      .doc(String(id))
      .set(cleaned, { merge: true });
    return;
  }
  const db = await loadLocal();
  const row = db.payments.find((p) => p.id === id);
  if (!row) return;
  Object.assign(row, cleaned);
  await saveLocal(db);
  invalidateStoreCache();
}

export async function deletePaymentRow(id: number): Promise<void> {
  if (isFirestore()) {
    await adminDb()!.collection("payments").doc(String(id)).delete();
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  db.payments = db.payments.filter((p) => p.id !== id);
  await saveLocal(db);
  invalidateStoreCache();
}

/** Delete a contribution request and all of its member payment rows. */
export async function deletePaymentRequestRow(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  if (isFirestore()) {
    const db = adminDb()!;
    const payments = await db
      .collection("payments")
      .where("payment_request_id", "==", id)
      .get();
    const batch = db.batch();
    for (const doc of payments.docs) batch.delete(doc.ref);
    batch.delete(db.collection("payment_requests").doc(String(id)));
    await batch.commit();
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  db.payments = db.payments.filter((p) => p.payment_request_id !== id);
  db.payment_requests = db.payment_requests.filter((r) => r.id !== id);
  await saveLocal(db);
  invalidateStoreCache();
}

function normalizeDuesSchedule(
  raw: Record<string, unknown>,
): DuesScheduleRow | null {
  if (!isAppRow(raw)) return null;
  const year = Number(raw.year);
  if (!Number.isFinite(year) || year < 2000) return null;
  const titleRaw = normalizePaymentTitle(String(raw.title ?? ""));
  const deadlineRaw = String(raw.deadline ?? "").trim();
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw)
    ? deadlineRaw
    : `${year}-12-31`;
  const concludedRaw = raw.concluded_at;
  const concluded_at =
    typeof concludedRaw === "string" && concludedRaw.trim()
      ? concludedRaw.trim()
      : null;
  return {
    id: Number(raw.id),
    year,
    title: titleRaw || `${year} Dues`,
    monthly_amount: money(
      (raw.monthly_amount as string | number | undefined) ??
        (raw.amount as string | number | undefined) ??
        0,
    ),
    deadline,
    concluded_at,
    created_at: String(raw.created_at ?? nowIso()),
  };
}

function normalizeDuesPayment(
  raw: Record<string, unknown>,
): DuesPaymentRow | null {
  if (!isAppRow(raw)) return null;
  let covered_months: number[] = [];
  if (Array.isArray(raw.covered_months)) {
    covered_months = raw.covered_months
      .map((m) => Number(m))
      .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12);
  }
  if (covered_months.length === 0) return null;
  const scheduleId = Number(
    raw.dues_schedule_id ?? raw.payment_request_id ?? NaN,
  );
  if (!Number.isFinite(scheduleId)) return null;
  return {
    id: Number(raw.id),
    dues_schedule_id: scheduleId,
    member_id: Number(raw.member_id),
    amount: money(raw.amount as string | number),
    covered_months,
    payment_date: String(raw.payment_date ?? ""),
    notes: normalizeNotes(raw.notes),
    created_at: String(raw.created_at ?? nowIso()),
  };
}

/** Migrate any legacy type=dues rows out of contribution tables once. */
async function migrateLegacyDuesFromPaymentTables(): Promise<void> {
  if (!isFirestore()) return;
  const db = adminDb()!;
  const [reqSnap, paySnap] = await Promise.all([
    db.collection("payment_requests").get(),
    db.collection("payments").get(),
  ]);

  for (const doc of reqSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.type !== "dues") continue;
    const year = Number(data.year);
    if (!Number.isFinite(year)) continue;
    const id = Number(data.id);
    const existing = await db.collection("dues_schedules").doc(String(id)).get();
    if (!existing.exists) {
      await db
        .collection("dues_schedules")
        .doc(String(id))
        .set({
          id,
          year,
          monthly_amount: money(data.amount as string | number),
          created_at: String(data.created_at ?? nowIso()),
        });
      const counter = db.collection("_counters").doc("dues_schedules");
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(counter);
        const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
        if (id > current) tx.set(counter, { value: id }, { merge: true });
      });
    }
    await doc.ref.delete();
  }

  for (const doc of paySnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.type !== "dues") continue;
    const mapped = normalizeDuesPayment(data);
    if (!mapped) {
      await doc.ref.delete();
      continue;
    }
    const existing = await db
      .collection("dues_payments")
      .doc(String(mapped.id))
      .get();
    if (!existing.exists) {
      await db.collection("dues_payments").doc(String(mapped.id)).set(mapped);
      const counter = db.collection("_counters").doc("dues_payments");
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(counter);
        const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
        if (mapped.id > current) {
          tx.set(counter, { value: mapped.id }, { merge: true });
        }
      });
    }
    await doc.ref.delete();
  }
}

let legacyDuesMigration: Promise<void> | null = null;
function ensureLegacyDuesMigrated(): Promise<void> {
  if (!legacyDuesMigration) {
    legacyDuesMigration = migrateLegacyDuesFromPaymentTables().catch((err) => {
      legacyDuesMigration = null;
      throw err;
    });
  }
  return legacyDuesMigration;
}

export async function createDuesSchedule(input: {
  year: number;
  monthly_amount: number;
  title?: string;
  deadline?: string;
  concluded_at?: string | null;
}): Promise<DuesScheduleRow> {
  await ensureLegacyDuesMigrated();
  const created_at = nowIso();
  const deadlineRaw = String(input.deadline ?? "").trim();
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw)
    ? deadlineRaw
    : `${input.year}-12-31`;
  const rowBase = {
    year: input.year,
    title:
      normalizePaymentTitle(input.title?.trim() || `${input.year} Dues`) ||
      `${input.year} Dues`,
    monthly_amount: money(input.monthly_amount),
    deadline,
    concluded_at: input.concluded_at ?? null,
    created_at,
  };
  if (isFirestore()) {
    const id = await firestoreNextId("dues_schedules");
    const row: DuesScheduleRow = { id, ...rowBase };
    await adminDb()!.collection("dues_schedules").doc(String(id)).set(row);
    invalidateStoreCache();
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "dues_schedules");
  const row: DuesScheduleRow = { id, ...rowBase };
  db.dues_schedules.push(row);
  await saveLocal(db);
  invalidateStoreCache();
  return row;
}

export const listAllDuesSchedules = cache(async (): Promise<DuesScheduleRow[]> => {
  return cachedLoad("dues_schedules", async () => {
    if (isFirestore()) {
      const snap = await withFirestoreRetry("dues_schedules.get", () =>
        adminDb()!.collection("dues_schedules").get(),
      );
      return snap.docs
        .map((d) => normalizeDuesSchedule(d.data() as Record<string, unknown>))
        .filter((d): d is DuesScheduleRow => d != null)
        .sort((a, b) => b.year - a.year || a.id - b.id);
    }
    const db = await loadLocal();
    return [...db.dues_schedules].sort((a, b) => b.year - a.year || a.id - b.id);
  });
});

export async function getDuesScheduleById(
  id: number,
): Promise<DuesScheduleRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (isFirestore()) {
    const snap = await adminDb()!
      .collection("dues_schedules")
      .doc(String(id))
      .get();
    if (!snap.exists) return null;
    return normalizeDuesSchedule(snap.data() as Record<string, unknown>);
  }
  const db = await loadLocal();
  return db.dues_schedules.find((r) => r.id === id) ?? null;
}

export async function getDuesScheduleByYear(
  year: number,
): Promise<DuesScheduleRow | null> {
  const all = await listAllDuesSchedules();
  return all.find((s) => s.year === year) ?? null;
}

export async function updateDuesScheduleRow(
  id: number,
  patch: Partial<
    Pick<DuesScheduleRow, "concluded_at" | "title" | "deadline" | "monthly_amount">
  >,
): Promise<void> {
  const cleaned: Record<string, unknown> = { ...patch };
  if (cleaned.monthly_amount != null) {
    cleaned.monthly_amount = money(cleaned.monthly_amount as string | number);
  }
  if (cleaned.title != null) {
    cleaned.title =
      normalizePaymentTitle(String(cleaned.title)) || String(cleaned.title);
  }
  if (isFirestore()) {
    await adminDb()!
      .collection("dues_schedules")
      .doc(String(id))
      .set(cleaned, { merge: true });
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  const row = db.dues_schedules.find((r) => r.id === id);
  if (!row) return;
  Object.assign(row, cleaned);
  await saveLocal(db);
  invalidateStoreCache();
}

export const listAllDuesPayments = cache(async (): Promise<DuesPaymentRow[]> => {
  return cachedLoad("dues_payments", async () => {
    if (isFirestore()) {
      const snap = await withFirestoreRetry("dues_payments.get", () =>
        adminDb()!.collection("dues_payments").get(),
      );
      return snap.docs
        .map((d) => normalizeDuesPayment(d.data() as Record<string, unknown>))
        .filter((d): d is DuesPaymentRow => d != null);
    }
    const db = await loadLocal();
    return [...db.dues_payments];
  });
});

export async function listDuesPaymentsForSchedule(
  scheduleId: number,
): Promise<DuesPaymentRow[]> {
  return (await listAllDuesPayments()).filter(
    (p) => p.dues_schedule_id === scheduleId,
  );
}

export async function listDuesPaymentsForMember(
  memberId: number,
): Promise<DuesPaymentRow[]> {
  return (await listAllDuesPayments()).filter((p) => p.member_id === memberId);
}

/** Contribution + dues payment rows tied to a roster member. */
export async function countPaymentsForMember(memberId: number): Promise<{
  contributions: number;
  dues: number;
  total: number;
}> {
  const [payments, dues] = await Promise.all([
    listAllPaymentRows(),
    listAllDuesPayments(),
  ]);
  const contributions = payments.filter((p) => p.member_id === memberId).length;
  const duesCount = dues.filter((p) => p.member_id === memberId).length;
  return {
    contributions,
    dues: duesCount,
    total: contributions + duesCount,
  };
}

export async function getDuesPaymentById(
  id: number,
): Promise<DuesPaymentRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (isFirestore()) {
    const snap = await adminDb()!
      .collection("dues_payments")
      .doc(String(id))
      .get();
    if (!snap.exists) return null;
    return normalizeDuesPayment(snap.data() as Record<string, unknown>);
  }
  const db = await loadLocal();
  return db.dues_payments.find((p) => p.id === id) ?? null;
}

export async function createDuesPayment(input: {
  dues_schedule_id: number;
  member_id: number;
  amount: number;
  covered_months: number[];
  payment_date: string;
  notes?: string | null;
}): Promise<DuesPaymentRow> {
  await ensureLegacyDuesMigrated();
  const created_at = nowIso();
  const covered_months = [...input.covered_months]
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b);
  const base = {
    dues_schedule_id: input.dues_schedule_id,
    member_id: input.member_id,
    amount: money(input.amount),
    covered_months,
    payment_date: input.payment_date,
    notes: normalizeNotes(input.notes ?? null),
    created_at,
  };
  if (isFirestore()) {
    const id = await firestoreNextId("dues_payments");
    const row: DuesPaymentRow = { id, ...base };
    await adminDb()!.collection("dues_payments").doc(String(id)).set(row);
    invalidateStoreCache();
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "dues_payments");
  const row: DuesPaymentRow = { id, ...base };
  db.dues_payments.push(row);
  await saveLocal(db);
  invalidateStoreCache();
  return row;
}

export async function deleteDuesPayment(id: number): Promise<void> {
  if (isFirestore()) {
    await adminDb()!.collection("dues_payments").doc(String(id)).delete();
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  db.dues_payments = db.dues_payments.filter((p) => p.id !== id);
  await saveLocal(db);
  invalidateStoreCache();
}

/** Delete a dues year schedule and all payments recorded against it. */
export async function deleteDuesSchedule(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  if (isFirestore()) {
    const db = adminDb()!;
    const payments = await db
      .collection("dues_payments")
      .where("dues_schedule_id", "==", id)
      .get();
    const batch = db.batch();
    for (const doc of payments.docs) batch.delete(doc.ref);
    batch.delete(db.collection("dues_schedules").doc(String(id)));
    await batch.commit();
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  db.dues_payments = db.dues_payments.filter((p) => p.dues_schedule_id !== id);
  db.dues_schedules = db.dues_schedules.filter((s) => s.id !== id);
  await saveLocal(db);
  invalidateStoreCache();
}

function normalizeExpenseKind(raw: unknown): ExpenseKind {
  if (raw === "member") return "member";
  if (raw === "meeting") return "meeting";
  return "miscellaneous";
}

function normalizeExpenseAllocations(raw: unknown): ExpenseAllocation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const member_id = Number(row.member_id);
      const amount = Number(row.amount);
      if (!Number.isFinite(member_id) || member_id <= 0) return null;
      // Allow 0 for historical placeholder expenses (amount unknown).
      if (!Number.isFinite(amount) || amount < 0) return null;
      return {
        member_id,
        amount: money(amount),
      } satisfies ExpenseAllocation;
    })
    .filter((row): row is ExpenseAllocation => row != null);
}

function normalizeExpenseCertifications(
  raw: unknown,
): ExpenseCertification[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ExpenseCertification[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const email = String(row.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      name: String(row.name ?? email).trim() || email,
      at: String(row.at ?? nowIso()),
    });
  }
  return out;
}

export function expenseIsCertified(
  certifications: ExpenseCertification[],
  certifiedAt: string | null,
): boolean {
  return Boolean(certifiedAt) || certifications.length >= 2;
}

function normalizeFundingSource(
  raw: unknown,
  paymentRequestId: number | null,
  contributionAmount: number,
  bankAmount: number,
): ExpenseFundingSource {
  if (raw === "contribution" || raw === "bank" || raw === "both") return raw;
  if (contributionAmount > 0 && bankAmount > 0) return "both";
  if (paymentRequestId != null || contributionAmount > 0) return "contribution";
  return "bank";
}

function normalizeExpense(raw: Record<string, unknown>): ExpenseRow | null {
  if (!isAppRow(raw)) return null;
  const notes = String(raw.notes ?? "").trim();
  const certifications = normalizeExpenseCertifications(raw.certifications);
  const certified_at =
    (raw.certified_at as string | null) ??
    (certifications.length >= 2
      ? certifications[1]?.at ?? nowIso()
      : null);
  const paymentRaw = Number(raw.payment_request_id);
  const payment_request_id =
    Number.isFinite(paymentRaw) && paymentRaw > 0 ? paymentRaw : null;
  const kind = normalizeExpenseKind(raw.kind);
  const amount = money(raw.amount as string | number);
  const amountNum = Number(amount);

  let contribution_amount: string;
  let bank_amount: string;
  const hasSplit =
    raw.contribution_amount != null || raw.bank_amount != null;
  if (hasSplit) {
    contribution_amount = money(Number(raw.contribution_amount ?? 0));
    bank_amount = money(Number(raw.bank_amount ?? 0));
  } else if (raw.funding_source === "contribution" || payment_request_id) {
    contribution_amount = amount;
    bank_amount = money(0);
  } else {
    contribution_amount = money(0);
    bank_amount = amount;
  }

  // Keep total coherent if legacy rows drift.
  const splitSum = Number(contribution_amount) + Number(bank_amount);
  if (Math.abs(splitSum - amountNum) > 0.009 && amountNum > 0) {
    if (Number(bank_amount) <= 0) contribution_amount = amount;
    else if (Number(contribution_amount) <= 0) bank_amount = amount;
  }

  return {
    id: Number(raw.id),
    expense_date: String(raw.expense_date ?? "").slice(0, 10),
    amount,
    kind,
    notes,
    allocations: normalizeExpenseAllocations(raw.allocations),
    funding_source: normalizeFundingSource(
      raw.funding_source,
      payment_request_id,
      Number(contribution_amount),
      Number(bank_amount),
    ),
    payment_request_id,
    contribution_amount,
    bank_amount,
    certifications,
    created_by_email: String(raw.created_by_email ?? "")
      .trim()
      .toLowerCase(),
    created_by_name: String(raw.created_by_name ?? "").trim(),
    created_at: coerceCreatedAt(raw),
    certified_at,
  };
}

function normalizeBankAccount(
  raw: Record<string, unknown> | null | undefined,
): BankAccountDetails {
  if (!raw) return { ...DEFAULT_BANK };
  const bank_name = String(raw.bank_name ?? "").trim();
  const account_name = String(raw.account_name ?? "").trim();
  const account_number = String(raw.account_number ?? "").trim();
  const bank_code = String(raw.bank_code ?? "").trim();
  if (!bank_name && !account_name && !account_number) {
    return { ...DEFAULT_BANK };
  }
  return {
    bank_name,
    account_name,
    account_number,
    bank_code,
    updated_at: (raw.updated_at as string | null) ?? null,
    updated_by: (raw.updated_by as string | null) ?? null,
  };
}

export const getBankAccountDetails = cache(
  async (): Promise<BankAccountDetails> => {
    return cachedLoad("bank_account", async () => {
      if (isFirestore()) {
        const snap = await adminDb()!
          .collection("settings")
          .doc("bank_account")
          .get();
        if (!snap.exists) return { ...DEFAULT_BANK };
        return normalizeBankAccount(snap.data() as Record<string, unknown>);
      }
      const db = await loadLocal();
      return normalizeBankAccount(db.bank_account);
    });
  },
);

export async function updateBankAccountDetails(input: {
  bank_name: string;
  account_name: string;
  account_number: string;
  bank_code?: string;
  updated_by: string;
}): Promise<BankAccountDetails> {
  const row: BankAccountDetails = {
    bank_name: input.bank_name.trim(),
    account_name: input.account_name.trim(),
    account_number: input.account_number.trim(),
    bank_code: (input.bank_code ?? "").trim(),
    updated_at: nowIso(),
    updated_by: input.updated_by.trim().toLowerCase() || null,
  };
  if (isFirestore()) {
    await adminDb()!
      .collection("settings")
      .doc("bank_account")
      .set(row, { merge: true });
    invalidateStoreCache();
    return row;
  }
  const db = await loadLocal();
  db.bank_account = row;
  await saveLocal(db);
  invalidateStoreCache();
  return row;
}

async function readExcoBoardRaw(): Promise<ExcoBoard> {
  if (isFirestore()) {
    const snap = await adminDb()!.collection("settings").doc("exco").get();
    if (!snap.exists) return normalizeExcoBoard(DEFAULT_EXCO_BOARD);
    return normalizeExcoBoard(snap.data() as Record<string, unknown>);
  }
  const db = await loadLocal();
  return normalizeExcoBoard(db.exco);
}

async function writeExcoBoard(board: ExcoBoard): Promise<ExcoBoard> {
  const normalized = normalizeExcoBoard(board);
  if (isFirestore()) {
    await adminDb()!
      .collection("settings")
      .doc("exco")
      .set(normalized, { merge: true });
  } else {
    const db = await loadLocal();
    db.exco = normalized;
    await saveLocal(db);
  }
  invalidateStoreCache();
  return normalized;
}

/**
 * Auto-link vacant EXCO seats to roster members using the election slate
 * match names. Persists when any link is made so positions stay movable later.
 */
async function ensureExcoMemberLinks(board: ExcoBoard): Promise<ExcoBoard> {
  const needsLink = board.seats.some((s) => s.member_id == null);
  if (!needsLink) return board;

  const { DEFAULT_EXCO_SLATE, matchMemberIdForSlate } = await import("./exco");
  const members = await listAllMembers();
  if (members.length === 0) return board;

  let changed = false;
  const seats = board.seats.map((seat) => {
    if (seat.member_id != null) return seat;
    const slate = DEFAULT_EXCO_SLATE.find((row) => row.office === seat.office);
    if (!slate) return seat;
    const member_id = matchMemberIdForSlate(members, slate.match_names);
    if (member_id == null) return seat;
    changed = true;
    return {
      ...seat,
      member_id,
      holder_name: seat.holder_name || slate.holder_name,
      updated_at: nowIso(),
      updated_by: "system",
    };
  });

  if (!changed) return board;
  return writeExcoBoard({
    seats,
    updated_at: nowIso(),
    updated_by: "system",
  });
}

export const getExcoBoard = cache(async (): Promise<ExcoBoard> => {
  return cachedLoad("exco", async () => {
    const board = await readExcoBoardRaw();
    return ensureExcoMemberLinks(board);
  });
});

/**
 * Assign (or clear) an EXCO office. One member may hold only one office;
 * assigning someone who already holds another office moves them.
 */
export async function assignExcoOffice(input: {
  office: ExcoOffice;
  member_id: number | null;
  holder_name?: string | null;
  updated_by: string;
}): Promise<ExcoBoard> {
  const board = await getExcoBoard();
  const memberId = input.member_id;
  if (memberId != null) {
    const member = await getMemberById(memberId);
    if (!member) throw new Error("Member not found.");
  }

  const updated_at = nowIso();
  const updated_by = input.updated_by.trim().toLowerCase() || null;
  const holderOverride = input.holder_name?.trim() || null;

  const seats = board.seats.map((seat) => {
    // Clear this member from any other office first.
    if (
      memberId != null &&
      seat.member_id === memberId &&
      seat.office !== input.office
    ) {
      return {
        ...seat,
        member_id: null,
        updated_at,
        updated_by,
      };
    }
    if (seat.office !== input.office) return seat;
    return {
      ...seat,
      member_id: memberId,
      holder_name: holderOverride || seat.holder_name,
      updated_at,
      updated_by,
    };
  });

  return writeExcoBoard({ seats, updated_at, updated_by });
}

export const getRegulations = cache(async (): Promise<RegulationsDoc> => {
  return cachedLoad("regulations", async () => {
    if (isFirestore()) {
      const snap = await adminDb()!.collection("settings").doc("regulations").get();
      if (!snap.exists) return defaultRegulationsDoc();
      return normalizeRegulationsDoc(snap.data() as Record<string, unknown>);
    }
    const db = await loadLocal();
    return normalizeRegulationsDoc(db.regulations);
  });
});

export async function saveRegulations(input: {
  title: string;
  intro: string;
  sections: RegulationsDoc["sections"];
  signatories: RegulationsDoc["signatories"];
  updated_by: string;
}): Promise<RegulationsDoc> {
  const doc = normalizeRegulationsDoc({
    title: input.title,
    intro: input.intro,
    sections: input.sections,
    signatories: input.signatories,
    updated_at: nowIso(),
    updated_by: input.updated_by.trim().toLowerCase() || null,
  });
  if (isFirestore()) {
    await adminDb()!
      .collection("settings")
      .doc("regulations")
      .set(doc, { merge: true });
  } else {
    const db = await loadLocal();
    db.regulations = doc;
    await saveLocal(db);
  }
  invalidateStoreCache();
  return doc;
}

export const listAllExpenses = cache(async (): Promise<ExpenseRow[]> => {
  return cachedLoad("expenses", async () => {
    if (isFirestore()) {
      const snap = await withFirestoreRetry("expenses.get", () =>
        adminDb()!.collection("expenses").get(),
      );
      return snap.docs
        .map((d) => normalizeExpense(d.data() as Record<string, unknown>))
        .filter((d): d is ExpenseRow => d != null)
        .sort((a, b) => {
          const byDate = b.expense_date.localeCompare(a.expense_date);
          if (byDate !== 0) return byDate;
          return b.id - a.id;
        });
    }
    const db = await loadLocal();
    return [...db.expenses].sort((a, b) => {
      const byDate = b.expense_date.localeCompare(a.expense_date);
      if (byDate !== 0) return byDate;
      return b.id - a.id;
    });
  });
});

export async function getExpenseById(
  id: number,
): Promise<ExpenseRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (isFirestore()) {
    const snap = await adminDb()!
      .collection("expenses")
      .doc(String(id))
      .get();
    if (!snap.exists) return null;
    return normalizeExpense(snap.data() as Record<string, unknown>);
  }
  const db = await loadLocal();
  return db.expenses.find((e) => e.id === id) ?? null;
}

export async function listExpensesForMember(
  memberId: number,
): Promise<ExpenseRow[]> {
  return (await listAllExpenses()).filter((e) =>
    e.allocations.some((a) => a.member_id === memberId),
  );
}

export async function createExpense(input: {
  expense_date: string;
  amount: number;
  kind: ExpenseKind;
  notes: string;
  allocations: ExpenseAllocation[];
  funding_source: ExpenseFundingSource;
  payment_request_id?: number | null;
  contribution_amount: number;
  bank_amount: number;
  created_by_email: string;
  created_by_name: string;
}): Promise<ExpenseRow> {
  const notes = input.notes.trim();
  const created_at = nowIso();
  const usesContribution =
    input.funding_source === "contribution" ||
    input.funding_source === "both";
  const payment_request_id =
    usesContribution &&
    input.payment_request_id &&
    input.payment_request_id > 0
      ? input.payment_request_id
      : null;
  const contribution_amount = money(
    usesContribution ? Math.max(0, input.contribution_amount) : 0,
  );
  const bank_amount = money(
    input.funding_source === "bank" || input.funding_source === "both"
      ? Math.max(0, input.bank_amount)
      : 0,
  );
  const amount = money(
    Number(contribution_amount) + Number(bank_amount) > 0
      ? Number(contribution_amount) + Number(bank_amount)
      : input.amount,
  );
  const base = {
    expense_date: input.expense_date,
    amount,
    kind: input.kind,
    notes,
    allocations:
      input.kind === "member"
        ? input.allocations.map((a) => ({
            member_id: a.member_id,
            amount: money(a.amount),
          }))
        : [],
    funding_source: input.funding_source,
    payment_request_id,
    contribution_amount,
    bank_amount,
    certifications: [] as ExpenseCertification[],
    created_by_email: input.created_by_email.trim().toLowerCase(),
    created_by_name: input.created_by_name.trim(),
    created_at,
    certified_at: null as string | null,
  };
  if (isFirestore()) {
    const id = await firestoreNextId("expenses");
    const row: ExpenseRow = { id, ...base };
    await adminDb()!.collection("expenses").doc(String(id)).set(row);
    invalidateStoreCache();
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "expenses");
  const row: ExpenseRow = { id, ...base };
  db.expenses.push(row);
  await saveLocal(db);
  invalidateStoreCache();
  return row;
}

export async function certifyExpense(
  id: number,
  certifier: { email: string; name: string },
): Promise<ExpenseRow | null> {
  const existing = await getExpenseById(id);
  if (!existing) return null;
  const email = certifier.email.trim().toLowerCase();
  if (!email) return existing;
  if (existing.certifications.some((c) => c.email === email)) {
    return existing;
  }
  const certifications = [
    ...existing.certifications,
    {
      email,
      name: certifier.name.trim() || email,
      at: nowIso(),
    },
  ];
  const certified_at =
    existing.certified_at ??
    (certifications.length >= 2
      ? certifications[certifications.length - 1]!.at
      : null);
  const patch = { certifications, certified_at };
  if (isFirestore()) {
    await adminDb()!
      .collection("expenses")
      .doc(String(id))
      .set(patch, { merge: true });
    invalidateStoreCache();
    return { ...existing, ...patch };
  }
  const db = await loadLocal();
  const row = db.expenses.find((e) => e.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  await saveLocal(db);
  invalidateStoreCache();
  return { ...row };
}

export async function deleteExpense(id: number): Promise<void> {
  if (isFirestore()) {
    await adminDb()!.collection("expenses").doc(String(id)).delete();
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  db.expenses = db.expenses.filter((e) => e.id !== id);
  await saveLocal(db);
  invalidateStoreCache();
}
