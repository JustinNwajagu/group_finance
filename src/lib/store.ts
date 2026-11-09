import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { isFirestore } from "./config";
import { cachedLoad, invalidateStoreCache } from "./firestore-cache";
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

/** Contribution request — kept separate from dues_schedules. */
export type PaymentRequestRow = {
  id: number;
  title: string;
  amount: string;
  deadline: string;
  concluded_at: string | null;
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

function normalizeNotes(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
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
  return isFirestore() ? "firestore" : "local";
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

export const listAllMembers = cache(async (): Promise<MemberRow[]> => {
  return cachedLoad("members", async () => {
    if (isFirestore()) {
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
    title: String(raw.title ?? ""),
    amount: money(raw.amount as string | number),
    deadline: String(raw.deadline ?? ""),
    concluded_at: (raw.concluded_at as string | null) ?? null,
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
    title: input.title,
    amount: money(input.amount),
    deadline: input.deadline,
    concluded_at: input.concluded_at ?? null,
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
        const snap = await adminDb()!.collection("payment_requests").get();
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
  patch: Partial<Pick<PaymentRequestRow, "concluded_at">>,
): Promise<void> {
  if (isFirestore()) {
    await adminDb()!
      .collection("payment_requests")
      .doc(String(id))
      .set(patch, { merge: true });
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  const row = db.payment_requests.find((r) => r.id === id);
  if (!row) return;
  Object.assign(row, patch);
  await saveLocal(db);
  invalidateStoreCache();
}

export const listAllPaymentRows = cache(async (): Promise<PaymentRow[]> => {
  return cachedLoad("payments", async () => {
    if (isFirestore()) {
      const snap = await adminDb()!.collection("payments").get();
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

function normalizeDuesSchedule(
  raw: Record<string, unknown>,
): DuesScheduleRow | null {
  if (!isAppRow(raw)) return null;
  const year = Number(raw.year);
  if (!Number.isFinite(year) || year < 2000) return null;
  const titleRaw = String(raw.title ?? "").trim();
  return {
    id: Number(raw.id),
    year,
    title: titleRaw || `${year} Dues`,
    monthly_amount: money(
      (raw.monthly_amount as string | number | undefined) ??
        (raw.amount as string | number | undefined) ??
        0,
    ),
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
}): Promise<DuesScheduleRow> {
  await ensureLegacyDuesMigrated();
  const created_at = nowIso();
  const rowBase = {
    year: input.year,
    title: (input.title?.trim() || `${input.year} Dues`).trim(),
    monthly_amount: money(input.monthly_amount),
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
      const snap = await adminDb()!.collection("dues_schedules").get();
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

export const listAllDuesPayments = cache(async (): Promise<DuesPaymentRow[]> => {
  return cachedLoad("dues_payments", async () => {
    if (isFirestore()) {
      const snap = await adminDb()!.collection("dues_payments").get();
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
