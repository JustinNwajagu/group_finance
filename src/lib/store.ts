import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { adminDb } from "./firebase-admin";
import { useFirestore } from "./config";
import type { PaymentStatus } from "./types";

export type MemberRow = {
  id: number;
  name: string;
  email: string | null;
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

type LocalDb = {
  counters: { members: number; payment_requests: number; payments: number };
  members: MemberRow[];
  payment_requests: PaymentRequestRow[];
  payments: PaymentRow[];
};

type GlobalStore = typeof globalThis & {
  __klefLocalDb?: LocalDb;
  __klefLocalDbWrite?: Promise<void>;
};

function emptyLocal(): LocalDb {
  return {
    counters: { members: 0, payment_requests: 0, payments: 0 },
    members: [],
    payment_requests: [],
    payments: [],
  };
}

const dataFile = () => path.join(process.cwd(), "data", "local-store.json");

async function loadLocal(): Promise<LocalDb> {
  const g = globalThis as GlobalStore;
  if (g.__klefLocalDb) return g.__klefLocalDb;
  try {
    const raw = await readFile(dataFile(), "utf8");
    g.__klefLocalDb = JSON.parse(raw) as LocalDb;
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
}): Promise<MemberRow> {
  const created_at = nowIso();
  if (useFirestore()) {
    const id = await firestoreNextId("members");
    const row: MemberRow = {
      id,
      name: input.name,
      email: input.email,
      created_at,
    };
    await adminDb()!.collection("members").doc(String(id)).set(row);
    return row;
  }
  const db = await loadLocal();
  const id = await nextLocalId(db, "members");
  const row: MemberRow = {
    id,
    name: input.name,
    email: input.email,
    created_at,
  };
  db.members.push(row);
  await saveLocal(db);
  return row;
}

export async function listAllMembers(): Promise<MemberRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!.collection("members").get();
    return snap.docs
      .map((d) => d.data())
      .filter((d): d is MemberRow => isAppRow(d as Record<string, unknown>))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }
  const db = await loadLocal();
  return [...db.members].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export async function getMemberById(id: number): Promise<MemberRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useFirestore()) {
    const snap = await adminDb()!.collection("members").doc(String(id)).get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    return isAppRow(data) ? (data as unknown as MemberRow) : null;
  }
  const db = await loadLocal();
  return db.members.find((m) => m.id === id) ?? null;
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
