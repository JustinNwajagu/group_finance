import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { adminAuth, adminDb } from "./firebase-admin";
import { useFirestore } from "./config";
import {
  countLinkedLogins,
  countMembers,
  createMember,
  getMemberById,
  listMembersWithoutLogin,
  updateMemberRow,
  type MemberRow,
} from "./store";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type AccessRequestRow = {
  id: number;
  email: string;
  name: string;
  phone: string;
  status: AccessRequestStatus;
  member_id: number | null;
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

function normalizeRequest(raw: Record<string, unknown>): AccessRequestRow | null {
  if (!isRow(raw)) return null;
  return {
    id: Number(raw.id),
    email: String(raw.email ?? "").toLowerCase(),
    name: String(raw.name ?? ""),
    phone: String(raw.phone ?? ""),
    status: (raw.status as AccessRequestStatus) ?? "pending",
    member_id:
      raw.member_id == null || raw.member_id === ""
        ? null
        : Number(raw.member_id),
    created_at: String(raw.created_at ?? ""),
    decided_at: (raw.decided_at as string | null) ?? null,
  };
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
    member_id: null,
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
      .map((d) => normalizeRequest(d.data() as Record<string, unknown>))
      .filter((d): d is AccessRequestRow => d != null);
  } else {
    rows = (await loadLocal()).requests
      .map((r) => normalizeRequest(r as unknown as Record<string, unknown>))
      .filter((d): d is AccessRequestRow => d != null);
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
    return normalizeRequest(snap.data() as Record<string, unknown>);
  }
  const found = (await loadLocal()).requests.find((r) => r.id === id);
  return found
    ? normalizeRequest(found as unknown as Record<string, unknown>)
    : null;
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

export async function updateAccessRequest(
  id: number,
  patch: Partial<
    Pick<AccessRequestRow, "status" | "decided_at" | "member_id">
  >,
): Promise<AccessRequestRow | null> {
  const existing = await getAccessRequestById(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };

  if (useFirestore()) {
    await adminDb()!
      .collection("access_requests")
      .doc(String(id))
      .set(patch, { merge: true });
    return next;
  }
  const db = await loadLocal();
  const idx = db.requests.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  db.requests[idx] = next;
  await saveLocal(db);
  return next;
}

export async function deleteAccessRequest(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  if (useFirestore()) {
    await adminDb()!.collection("access_requests").doc(String(id)).delete();
    return;
  }
  const db = await loadLocal();
  db.requests = db.requests.filter((r) => r.id !== id);
  await saveLocal(db);
}

export async function loginCapacity(): Promise<{
  members: number;
  logins: number;
  remaining: number;
}> {
  const [members, logins] = await Promise.all([
    countMembers(),
    countLinkedLogins(),
  ]);
  return { members, logins, remaining: Math.max(0, members - logins) };
}

/**
 * Create Auth login and link to an existing member, or create a new member.
 * Login count cannot exceed member count.
 */
export async function provisionApprovedUser(
  request: AccessRequestRow,
  choice:
    | { mode: "link"; memberId: number }
    | { mode: "create" },
): Promise<{ passwordResetLink: string | null; member: MemberRow }> {
  const capacity = await loginCapacity();

  let member: MemberRow | null = null;

  if (choice.mode === "link") {
    member = await getMemberById(choice.memberId);
    if (!member) {
      throw new Error("Selected member was not found.");
    }
    if (member.auth_uid) {
      throw new Error("That member already has a login linked.");
    }
    if (capacity.remaining < 1) {
      throw new Error(
        "All members already have logins. Add a member before approving more accounts.",
      );
    }
  } else {
    // Creating a member increases roster by 1 and login by 1 — always capacity-safe.
    member = await createMember({
      name: request.name,
      email: request.email,
      phone: request.phone,
    });
  }

  const auth = adminAuth();
  let passwordResetLink: string | null = null;
  let authUid: string | null = null;

  if (auth) {
    let createdFresh = false;
    try {
      const existing = await auth.getUserByEmail(request.email);
      authUid = existing.uid;
    } catch {
      // Fallback if the requester somehow has no Auth user yet.
      const crypto = await import("node:crypto");
      const temp = crypto.randomBytes(18).toString("base64url") + "Aa1!";
      const created = await auth.createUser({
        email: request.email,
        password: temp,
        displayName: request.name,
        emailVerified: false,
      });
      authUid = created.uid;
      createdFresh = true;
    }
    // Only mint a reset link when we had to invent a temporary password.
    if (createdFresh) {
      try {
        passwordResetLink = await auth.generatePasswordResetLink(request.email);
      } catch {
        passwordResetLink = null;
      }
    }
  }

  await updateMemberRow(member.id, {
    auth_uid: authUid,
    login_email: request.email,
    email: member.email || request.email,
    phone: member.phone || request.phone || null,
  });

  const linked = (await getMemberById(member.id)) ?? {
    ...member,
    auth_uid: authUid,
    login_email: request.email,
  };

  return { passwordResetLink, member: linked };
}

/**
 * Remove Firebase login for a member but keep the roster row.
 * Clears auth_uid / login_email so a new login can be linked later.
 */
export async function deleteMemberLogin(memberId: number): Promise<void> {
  const member = await getMemberById(memberId);
  if (!member) {
    throw new Error("Member not found.");
  }
  if (!member.auth_uid && !member.login_email) {
    throw new Error("This member has no login to delete.");
  }

  const auth = adminAuth();
  if (auth) {
    try {
      if (member.auth_uid) {
        await auth.deleteUser(member.auth_uid);
      } else if (member.login_email) {
        const user = await auth.getUserByEmail(member.login_email);
        await auth.deleteUser(user.uid);
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Already gone in Auth — still clear the roster link.
      if (code !== "auth/user-not-found") {
        throw err instanceof Error ? err : new Error("Could not delete login.");
      }
    }
  }

  await updateMemberRow(memberId, {
    auth_uid: null,
    login_email: null,
  });

  // Remove the approved access record so they cannot sign in again
  // until a new request is approved.
  if (member.login_email) {
    const rows = await listAccessRequests();
    const match = rows.find(
      (r) =>
        r.email === member.login_email!.toLowerCase() &&
        r.status === "approved",
    );
    if (match) {
      await deleteAccessRequest(match.id);
    }
  }
}

export { listMembersWithoutLogin, listMembersWithLogin } from "./store";
