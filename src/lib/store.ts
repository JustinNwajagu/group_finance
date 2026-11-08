import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { useFirestore } from "./config";
import { compareMembersByName } from "./member-sort";
import type { PaymentStatus } from "./types";

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
  title: string;
  amount: string;
  deadline: string;
  concluded_at: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: number;
  payment_request_id: number;
  member_id: number;
  amount: string;
  payment_date: string | null;
  status: PaymentStatus;
  created_at: string;
};

export type DuesScheduleRow = {
  id: number;
  year: number;
  monthly_amount: string;
  created_at: string;
};

export type DuesPaymentRow = {
  id: number;
  dues_schedule_id: number;
  member_id: number;
  amount: string;
  covered_months: number[];
  payment_date: string;
  created_at: string;
};

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

export async function createPaymentRequestRow(input: {
  title: string;
  amount: number;
  deadline: string;
}): Promise<PaymentRequestRow> {
  const created_at = nowIso();
  const rowBase = {
    title: input.title,
    amount: money(input.amount),
    deadline: input.deadline,
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
      .map((d) => d.data())
      .filter((d): d is PaymentRequestRow =>
        isAppRow(d as Record<string, unknown>),
      );
  }
  const db = await loadLocal();
  return [...db.payment_requests];
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
    const data = snap.data() as Record<string, unknown>;
    return isAppRow(data) ? (data as unknown as PaymentRequestRow) : null;
  }
  const db = await loadLocal();
  return db.payment_requests.find((r) => r.id === id) ?? null;
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
      .map((d) => d.data())
      .filter((d): d is PaymentRow => isAppRow(d as Record<string, unknown>));
  }
  const db = await loadLocal();
  return [...db.payments];
}

export async function getPaymentById(id: number): Promise<PaymentRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useFirestore()) {
    const snap = await adminDb()!.collection("payments").doc(String(id)).get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    return isAppRow(data) ? (data as unknown as PaymentRow) : null;
  }
  const db = await loadLocal();
  return db.payments.find((p) => p.id === id) ?? null;
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
    return snap.empty ? null : (snap.docs[0].data() as PaymentRow);
  }
  const db = await loadLocal();
  return (
    db.payments.find(
      (p) =>
        p.payment_request_id === paymentRequestId && p.member_id === memberId,
    ) ?? null
  );
}

export async function createPaymentRow(input: {
  payment_request_id: number;
  member_id: number;
  amount: number | string;
  status: PaymentStatus;
  payment_date: string | null;
}): Promise<PaymentRow> {
  const created_at = nowIso();
  const base = {
    payment_request_id: input.payment_request_id,
    member_id: input.member_id,
    amount: money(input.amount),
    status: input.status,
    payment_date: input.payment_date,
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

function normalizeDuesSchedule(
  raw: Record<string, unknown>,
): DuesScheduleRow | null {
  if (!isAppRow(raw)) return null;
  const year = Number(raw.year);
  if (!Number.isFinite(year) || year < 2000) return null;
  return {
    id: Number(raw.id),
    year,
    monthly_amount: money(raw.monthly_amount as string | number),
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
  } else {
    // Legacy shape: start_month + months
    const start = Number(raw.start_month);
    const count = Number(raw.months);
    if (Number.isFinite(start) && Number.isFinite(count) && count >= 1) {
      for (let i = 0; i < count; i += 1) {
        const m = start + i;
        if (m >= 1 && m <= 12) covered_months.push(m);
      }
    }
  }
  if (covered_months.length === 0) return null;
  return {
    id: Number(raw.id),
    dues_schedule_id: Number(raw.dues_schedule_id),
    member_id: Number(raw.member_id),
    amount: money(raw.amount as string | number),
    covered_months,
    payment_date: String(raw.payment_date ?? ""),
    created_at: String(raw.created_at ?? nowIso()),
  };
}

export async function createDuesSchedule(input: {
  year: number;
  monthly_amount: number;
}): Promise<DuesScheduleRow> {
  const created_at = nowIso();
  const rowBase = {
    year: input.year,
    monthly_amount: money(input.monthly_amount),
    created_at,
  };
  if (useFirestore()) {
    const id = await firestoreNextId("dues_schedules");
    const row: DuesScheduleRow = { id, ...rowBase };
    await adminDb()!.collection("dues_schedules").doc(String(id)).set(row);
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "dues_schedules");
  const row: DuesScheduleRow = { id, ...rowBase };
  db.dues_schedules.push(row);
  await saveLocal(db);
  return row;
}

export async function listAllDuesSchedules(): Promise<DuesScheduleRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!.collection("dues_schedules").get();
    return snap.docs
      .map((d) => normalizeDuesSchedule(d.data() as Record<string, unknown>))
      .filter((d): d is DuesScheduleRow => d != null)
      .sort((a, b) => b.year - a.year || a.id - b.id);
  }
  const db = await loadLocal();
  return [...db.dues_schedules].sort((a, b) => b.year - a.year || a.id - b.id);
}

export async function getDuesScheduleById(
  id: number,
): Promise<DuesScheduleRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useFirestore()) {
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

export async function listAllDuesPayments(): Promise<DuesPaymentRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!.collection("dues_payments").get();
    return snap.docs
      .map((d) => normalizeDuesPayment(d.data() as Record<string, unknown>))
      .filter((d): d is DuesPaymentRow => d != null);
  }
  const db = await loadLocal();
  return [...db.dues_payments];
}

export async function listDuesPaymentsForSchedule(
  scheduleId: number,
): Promise<DuesPaymentRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!
      .collection("dues_payments")
      .where("dues_schedule_id", "==", scheduleId)
      .get();
    return snap.docs
      .map((d) => normalizeDuesPayment(d.data() as Record<string, unknown>))
      .filter((d): d is DuesPaymentRow => d != null);
  }
  const db = await loadLocal();
  return db.dues_payments.filter((p) => p.dues_schedule_id === scheduleId);
}

export async function listDuesPaymentsForMember(
  memberId: number,
): Promise<DuesPaymentRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!
      .collection("dues_payments")
      .where("member_id", "==", memberId)
      .get();
    return snap.docs
      .map((d) => normalizeDuesPayment(d.data() as Record<string, unknown>))
      .filter((d): d is DuesPaymentRow => d != null);
  }
  const db = await loadLocal();
  return db.dues_payments.filter((p) => p.member_id === memberId);
}

export async function getDuesPaymentById(
  id: number,
): Promise<DuesPaymentRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useFirestore()) {
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
}): Promise<DuesPaymentRow> {
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
    created_at,
  };
  if (useFirestore()) {
    const id = await firestoreNextId("dues_payments");
    const row: DuesPaymentRow = { id, ...base };
    await adminDb()!.collection("dues_payments").doc(String(id)).set(row);
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "dues_payments");
  const row: DuesPaymentRow = { id, ...base };
  db.dues_payments.push(row);
  await saveLocal(db);
  return row;
}

export async function deleteDuesPayment(id: number): Promise<void> {
  if (useFirestore()) {
    await adminDb()!.collection("dues_payments").doc(String(id)).delete();
    return;
  }
  const db = await loadLocal();
  db.dues_payments = db.dues_payments.filter((p) => p.id !== id);
  await saveLocal(db);
}
