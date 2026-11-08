import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { adminAuth, adminDb } from "./firebase-admin";
import { useFirestore } from "./config";
import { createMember, listAllMembers } from "./store";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type AccessRequestRow = {
  id: number;
  email: string;
  name: string;
  phone: string;
  status: AccessRequestStatus;
  created_at: string;
  decided_at: string | null;
};

type LocalAccessDb = {
  counter: number;
  requests: AccessRequestRow[];
};

type GlobalAccess = typeof globalThis & {
  __klefAccessDb?: LocalAccessDb;
};

function dataFile() {
  return path.join(process.cwd(), "data", "access-requests.json");
}

async function loadLocal(): Promise<LocalAccessDb> {
  const g = globalThis as GlobalAccess;
  if (g.__klefAccessDb) return g.__klefAccessDb;
  try {
    g.__klefAccessDb = JSON.parse(
      await readFile(dataFile(), "utf8"),
    ) as LocalAccessDb;
  } catch {
    g.__klefAccessDb = { counter: 0, requests: [] };
  }
  return g.__klefAccessDb;
}

async function saveLocal(db: LocalAccessDb): Promise<void> {
  const g = globalThis as GlobalAccess;
  g.__klefAccessDb = db;
  await mkdir(path.dirname(dataFile()), { recursive: true });
  await writeFile(dataFile(), JSON.stringify(db, null, 2));
}

function isRow(data: Record<string, unknown> | undefined): boolean {
  if (!data || data._meta === true) return false;
  return Number.isFinite(Number(data.id));
}

async function nextId(): Promise<number> {
  if (useFirestore()) {
    const db = adminDb()!;
    const ref = db.collection("_counters").doc("access_requests");
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
      const next = current + 1;
      tx.set(ref, { value: next }, { merge: true });
      return next;
    });
  }
  const db = await loadLocal();
  db.counter += 1;
  return db.counter;
}

export async function createAccessRequest(input: {
  email: string;
  name: string;
  phone: string;
}): Promise<AccessRequestRow> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone.trim();
  const created_at = new Date().toISOString();
  const id = await nextId();
  const row: AccessRequestRow = {
    id,
    email,
    name,
    phone,
    status: "pending",
    created_at,
    decided_at: null,
  };

  if (useFirestore()) {
    await adminDb()!.collection("access_requests").doc(String(id)).set(row);
    return row;
  }
  const db = await loadLocal();
  db.requests.push(row);
  await saveLocal(db);
  return row;
}

export async function listAccessRequests(
  status?: AccessRequestStatus,
): Promise<AccessRequestRow[]> {
  let rows: AccessRequestRow[];
  if (useFirestore()) {
    const snap = await adminDb()!.collection("access_requests").get();
    rows = snap.docs
      .map((d) => d.data())
      .filter((d): d is AccessRequestRow =>
        isRow(d as Record<string, unknown>),
      );
  } else {
    rows = [...(await loadLocal()).requests];
  }
  if (status) rows = rows.filter((r) => r.status === status);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getAccessRequestById(
  id: number,
): Promise<AccessRequestRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  if (useFirestore()) {
    const snap = await adminDb()!
      .collection("access_requests")
      .doc(String(id))
      .get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    return isRow(data) ? (data as unknown as AccessRequestRow) : null;
  }
  return (await loadLocal()).requests.find((r) => r.id === id) ?? null;
}

export async function findPendingOrApprovedByEmail(
  email: string,
): Promise<AccessRequestRow | null> {
  const target = email.trim().toLowerCase();
  const rows = await listAccessRequests();
  return (
    rows.find(
      (r) =>
        r.email === target &&
        (r.status === "pending" || r.status === "approved"),
    ) ?? null
  );
}

export async function emailHasAuthAccount(email: string): Promise<boolean> {
  const auth = adminAuth();
  if (!auth) return false;
  try {
    await auth.getUserByEmail(email.trim().toLowerCase());
    return true;
  } catch {
    return false;
  }
}

export async function emailIsApproved(email: string): Promise<boolean> {
  const target = email.trim().toLowerCase();
  const rows = await listAccessRequests();
  return rows.some((r) => r.email === target && r.status === "approved");
}

export async function updateAccessRequestStatus(
  id: number,
  status: Exclude<AccessRequestStatus, "pending">,
): Promise<AccessRequestRow | null> {
  const existing = await getAccessRequestById(id);
  if (!existing) return null;
  const decided_at = new Date().toISOString();
  const next = { ...existing, status, decided_at };

  if (useFirestore()) {
    await adminDb()!
      .collection("access_requests")
      .doc(String(id))
      .set({ status, decided_at }, { merge: true });
    return next;
  }
  const db = await loadLocal();
  const idx = db.requests.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  db.requests[idx] = next;
  await saveLocal(db);
  return next;
}

/** Create Auth user + roster member when an admin approves a request. */
export async function provisionApprovedUser(
  request: AccessRequestRow,
): Promise<{ passwordResetLink: string | null }> {
  const auth = adminAuth();
  let passwordResetLink: string | null = null;

  if (auth) {
    try {
      await auth.getUserByEmail(request.email);
    } catch {
      const crypto = await import("node:crypto");
      const temp =
        crypto.randomBytes(18).toString("base64url") + "Aa1!";
      await auth.createUser({
        email: request.email,
        password: temp,
        displayName: request.name,
        emailVerified: false,
      });
    }
    try {
      passwordResetLink = await auth.generatePasswordResetLink(request.email);
    } catch {
      passwordResetLink = null;
    }
  }

  const members = await listAllMembers();
  const already = members.some(
    (m) => (m.email ?? "").toLowerCase() === request.email,
  );
  if (!already) {
    await createMember({ name: request.name, email: request.email });
  }

  return { passwordResetLink };
}
