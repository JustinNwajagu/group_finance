import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { useFirestore } from "./config";
import { compareMembersByName } from "./member-sort";
import type { PaymentStatus, PaymentType } from "./types";

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

export type PaymentRequestRow = {
  id: number;
  type: PaymentType;
  title: string;
  amount: string;
  deadline: string;
  year: number | null;
  concluded_at: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: number;
  type: PaymentType;
  payment_request_id: number;
  member_id: number;
  amount: string;
  payment_date: string | null;
  status: PaymentStatus;
  covered_months: number[] | null;
  created_at: string;
};

/** View of a dues-year payment_request (type=dues). */
export type DuesScheduleRow = {
  id: number;
  year: number;
  monthly_amount: string;
  created_at: string;
};

/** View of a dues payment row (type=dues). */
export type DuesPaymentRow = {
  id: number;
  dues_schedule_id: number;
  member_id: number;
  amount: string;
  covered_months: number[];
  payment_date: string;
  created_at: string;
};

function coercePaymentType(raw: unknown): PaymentType {
  return raw === "dues" ? "dues" : "contribution";
}

type LocalDb = {
  counters: {
    members: number;
    payment_requests: number;
    payments: number;
    dues_schedules: number;
    dues_payments: number;
  };
  members: MemberRow[];
  payment_requests: PaymentRequestRow[];
  payments: PaymentRow[];
  dues_schedules: DuesScheduleRow[];
  dues_payments: DuesPaymentRow[];
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
    },
    members: [],
    payment_requests: [],
    payments: [],
    dues_schedules: [],
    dues_payments: [],
  };
}

/** Backfill fields if an older local-store.json is missing dues collections. */
function normalizeLocal(db: LocalDb): LocalDb {
  db.counters.dues_schedules ??= 0;
  db.counters.dues_payments ??= 0;
  db.dues_schedules ??= [];
  db.dues_payments ??= [];
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
  return useFirestore() ? "firestore" : "local";
}

export async function createMember(input: {
  name: string;
  email: string | null;
  phone?: string | null;
}): Promise<MemberRow> {
  const created_at = nowIso();
  const rowBase = {
    name: input.name,
    email: input.email,
    phone: input.phone?.trim() || null,
    auth_uid: null as string | null,
    login_email: null as string | null,
    created_at,
  };
  if (useFirestore()) {
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
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "members");
  const row: MemberRow = { id, ...rowBase };
  db.members.push(row);
  await saveLocal(db);
  return row;
}

export async function updateMemberRow(
  id: number,
  patch: Partial<
    Pick<MemberRow, "name" | "email" | "phone" | "auth_uid" | "login_email">
  >,
): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  if (useFirestore()) {
    await adminDb()!
      .collection("members")
      .doc(String(id))
      .set(patch, { merge: true });
    return;
  }
  const db = await loadLocal();
  const row = db.members.find((m) => m.id === id);
  if (!row) return;
  Object.assign(row, patch);
  await saveLocal(db);
}

/** Roster members that do not yet have a linked login. */
export async function listMembersWithoutLogin(): Promise<MemberRow[]> {
  return (await listAllMembers()).filter((m) => !m.auth_uid);
}

/** Roster members that currently have a linked login. */
export async function listMembersWithLogin(): Promise<MemberRow[]> {
  return (await listAllMembers()).filter((m) => Boolean(m.auth_uid));
}

export async function countMembers(): Promise<number> {
  return (await listAllMembers()).length;
}

export async function countLinkedLogins(): Promise<number> {
  return (await listAllMembers()).filter((m) => Boolean(m.auth_uid)).length;
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

export async function listAllMembers(): Promise<MemberRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!.collection("members").get();
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
}

export async function getMemberById(id: number): Promise<MemberRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useFirestore()) {
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
  const type = coercePaymentType(raw.type);
  const yearRaw = raw.year != null ? Number(raw.year) : null;
  return {
    id: Number(raw.id),
    type,
    title: String(raw.title ?? ""),
    amount: money(raw.amount as string | number),
    deadline: String(raw.deadline ?? ""),
    year:
      type === "dues" && yearRaw != null && Number.isFinite(yearRaw)
        ? yearRaw
        : null,
    concluded_at: (raw.concluded_at as string | null) ?? null,
    created_at: String(raw.created_at ?? nowIso()),
  };
}

function normalizePayment(raw: Record<string, unknown>): PaymentRow | null {
  if (!isAppRow(raw)) return null;
  const type = coercePaymentType(raw.type);
  let covered_months: number[] | null = null;
  if (Array.isArray(raw.covered_months)) {
    covered_months = raw.covered_months
      .map((m) => Number(m))
      .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12);
  }
  return {
    id: Number(raw.id),
    type,
    payment_request_id: Number(raw.payment_request_id),
    member_id: Number(raw.member_id),
    amount: money(raw.amount as string | number),
    payment_date: (raw.payment_date as string | null) ?? null,
    status: raw.status === "paid" ? "paid" : "pledge",
    covered_months: type === "dues" ? covered_months ?? [] : null,
    created_at: String(raw.created_at ?? nowIso()),
  };
}

export async function createPaymentRequestRow(input: {
  title: string;
  amount: number;
  deadline: string;
  type?: PaymentType;
  year?: number | null;
}): Promise<PaymentRequestRow> {
  const created_at = nowIso();
  const type = input.type ?? "contribution";
  const rowBase = {
    type,
    title: input.title,
    amount: money(input.amount),
    deadline: input.deadline,
    year: type === "dues" ? (input.year ?? null) : null,
    concluded_at: null as string | null,
    created_at,
  };
  if (useFirestore()) {
    const id = await firestoreNextId("payment_requests");
    const row: PaymentRequestRow = { id, ...rowBase };
    await adminDb()!.collection("payment_requests").doc(String(id)).set(row);
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "payment_requests");
  const row: PaymentRequestRow = { id, ...rowBase };
  db.payment_requests.push(row);
  await saveLocal(db);
  return row;
}

export async function listAllPaymentRequestRows(): Promise<PaymentRequestRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!.collection("payment_requests").get();
    return snap.docs
      .map((d) => normalizePaymentRequest(d.data() as Record<string, unknown>))
      .filter((d): d is PaymentRequestRow => d != null);
  }
  const db = await loadLocal();
  return db.payment_requests
    .map((r) => normalizePaymentRequest(r as unknown as Record<string, unknown>))
    .filter((d): d is PaymentRequestRow => d != null);
}

export async function listPaymentRequestRowsByType(
  type: PaymentType,
): Promise<PaymentRequestRow[]> {
  return (await listAllPaymentRequestRows()).filter((r) => r.type === type);
}

export async function getPaymentRequestById(
  id: number,
): Promise<PaymentRequestRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useFirestore()) {
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
  patch: Partial<Pick<PaymentRequestRow, "concluded_at">>,
): Promise<void> {
  if (useFirestore()) {
    await adminDb()!
      .collection("payment_requests")
      .doc(String(id))
      .set(patch, { merge: true });
    return;
  }
  const db = await loadLocal();
  const row = db.payment_requests.find((r) => r.id === id);
  if (!row) return;
  Object.assign(row, patch);
  await saveLocal(db);
}

export async function listAllPaymentRows(): Promise<PaymentRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!.collection("payments").get();
    return snap.docs
      .map((d) => normalizePayment(d.data() as Record<string, unknown>))
      .filter((d): d is PaymentRow => d != null);
  }
  const db = await loadLocal();
  return db.payments
    .map((p) => normalizePayment(p as unknown as Record<string, unknown>))
    .filter((d): d is PaymentRow => d != null);
}

export async function listPaymentRowsByType(
  type: PaymentType,
): Promise<PaymentRow[]> {
  return (await listAllPaymentRows()).filter((p) => p.type === type);
}

export async function getPaymentById(id: number): Promise<PaymentRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useFirestore()) {
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
  if (useFirestore()) {
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
  type?: PaymentType;
  covered_months?: number[] | null;
}): Promise<PaymentRow> {
  const created_at = nowIso();
  const type = input.type ?? "contribution";
  const covered =
    type === "dues" && Array.isArray(input.covered_months)
      ? [...input.covered_months]
          .filter((m) => m >= 1 && m <= 12)
          .sort((a, b) => a - b)
      : null;
  const base = {
    type,
    payment_request_id: input.payment_request_id,
    member_id: input.member_id,
    amount: money(input.amount),
    status: input.status,
    payment_date: input.payment_date,
    covered_months: covered,
    created_at,
  };
  if (useFirestore()) {
    const id = await firestoreNextId("payments");
    const row: PaymentRow = { id, ...base };
    await adminDb()!.collection("payments").doc(String(id)).set(row);
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "payments");
  const row: PaymentRow = { id, ...base };
  db.payments.push(row);
  await saveLocal(db);
  return row;
}

export async function updatePaymentRow(
  id: number,
  patch: Partial<
    Pick<PaymentRow, "amount" | "status" | "payment_date">
  >,
): Promise<void> {
  const cleaned = { ...patch };
  if (cleaned.amount != null) cleaned.amount = money(cleaned.amount);
  if (useFirestore()) {
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
}

export async function deletePaymentRow(id: number): Promise<void> {
  if (useFirestore()) {
    await adminDb()!.collection("payments").doc(String(id)).delete();
    return;
  }
  const db = await loadLocal();
  db.payments = db.payments.filter((p) => p.id !== id);
  await saveLocal(db);
}

function scheduleFromRequest(row: PaymentRequestRow): DuesScheduleRow | null {
  if (row.type !== "dues" || row.year == null) return null;
  return {
    id: row.id,
    year: row.year,
    monthly_amount: row.amount,
    created_at: row.created_at,
  };
}

function duesPaymentFromRow(row: PaymentRow): DuesPaymentRow | null {
  if (row.type !== "dues") return null;
  const covered = row.covered_months ?? [];
  if (covered.length === 0) return null;
  return {
    id: row.id,
    dues_schedule_id: row.payment_request_id,
    member_id: row.member_id,
    amount: row.amount,
    covered_months: covered,
    payment_date: row.payment_date ?? "",
    created_at: row.created_at,
  };
}

/** Opens a dues year as a typed payment_request (type=dues). */
export async function createDuesSchedule(input: {
  year: number;
  monthly_amount: number;
}): Promise<DuesScheduleRow> {
  const row = await createPaymentRequestRow({
    type: "dues",
    title: `${input.year} Dues`,
    amount: input.monthly_amount,
    deadline: `${input.year}-12-31`,
    year: input.year,
  });
  const schedule = scheduleFromRequest(row);
  if (!schedule) throw new Error("Failed to create dues schedule.");
  return schedule;
}

export async function listAllDuesSchedules(): Promise<DuesScheduleRow[]> {
  return (await listPaymentRequestRowsByType("dues"))
    .map(scheduleFromRequest)
    .filter((d): d is DuesScheduleRow => d != null)
    .sort((a, b) => b.year - a.year || a.id - b.id);
}

export async function getDuesScheduleById(
  id: number,
): Promise<DuesScheduleRow | null> {
  const row = await getPaymentRequestById(id);
  return row ? scheduleFromRequest(row) : null;
}

export async function getDuesScheduleByYear(
  year: number,
): Promise<DuesScheduleRow | null> {
  const all = await listAllDuesSchedules();
  return all.find((s) => s.year === year) ?? null;
}

export async function listAllDuesPayments(): Promise<DuesPaymentRow[]> {
  return (await listPaymentRowsByType("dues"))
    .map(duesPaymentFromRow)
    .filter((d): d is DuesPaymentRow => d != null);
}

export async function listDuesPaymentsForSchedule(
  scheduleId: number,
): Promise<DuesPaymentRow[]> {
  return (await listPaymentRowsByType("dues"))
    .filter((p) => p.payment_request_id === scheduleId)
    .map(duesPaymentFromRow)
    .filter((d): d is DuesPaymentRow => d != null);
}

export async function listDuesPaymentsForMember(
  memberId: number,
): Promise<DuesPaymentRow[]> {
  return (await listPaymentRowsByType("dues"))
    .filter((p) => p.member_id === memberId)
    .map(duesPaymentFromRow)
    .filter((d): d is DuesPaymentRow => d != null);
}

export async function getDuesPaymentById(
  id: number,
): Promise<DuesPaymentRow | null> {
  const row = await getPaymentById(id);
  return row ? duesPaymentFromRow(row) : null;
}

export async function createDuesPayment(input: {
  dues_schedule_id: number;
  member_id: number;
  amount: number;
  covered_months: number[];
  payment_date: string;
}): Promise<DuesPaymentRow> {
  const row = await createPaymentRow({
    type: "dues",
    payment_request_id: input.dues_schedule_id,
    member_id: input.member_id,
    amount: input.amount,
    status: "paid",
    payment_date: input.payment_date,
    covered_months: input.covered_months,
  });
  const mapped = duesPaymentFromRow(row);
  if (!mapped) throw new Error("Failed to create dues payment.");
  return mapped;
}

export async function deleteDuesPayment(id: number): Promise<void> {
  await deletePaymentRow(id);
}
