import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { adminDb } from "./firebase-admin";
import { adminEmail, isAdminEmail, useFirestore } from "./config";
import { cachedLoad, invalidateStoreCache } from "./firestore-cache";
import type { AppRole } from "./types";

export type UserRoleRow = {
  email: string;
  role: "admin" | "member";
  updated_at: string;
  updated_by: string | null;
};

type LocalRoles = {
  roles: UserRoleRow[];
};

type GlobalStore = typeof globalThis & {
  __klefUserRoles?: LocalRoles;
};

function nowIso() {
  return new Date().toISOString();
}

function rolesFile() {
  return path.join(process.cwd(), "data", "user-roles.json");
}

async function loadLocal(): Promise<LocalRoles> {
  const g = globalThis as GlobalStore;
  if (g.__klefUserRoles) return g.__klefUserRoles;
  try {
    const raw = await readFile(rolesFile(), "utf8");
    g.__klefUserRoles = JSON.parse(raw) as LocalRoles;
  } catch {
    g.__klefUserRoles = { roles: [] };
  }
  return g.__klefUserRoles;
}

async function saveLocal(db: LocalRoles): Promise<void> {
  const g = globalThis as GlobalStore;
  g.__klefUserRoles = db;
  await mkdir(path.dirname(rolesFile()), { recursive: true });
  await writeFile(rolesFile(), JSON.stringify(db, null, 2));
}

function normalizeRole(raw: unknown): "admin" | "member" {
  return raw === "admin" ? "admin" : "member";
}

/**
 * Effective app role for a signed-in email.
 * The configured ADMIN_EMAIL is always admin and cannot be demoted.
 */
export async function resolveAppRole(email: string): Promise<AppRole> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return "member";
  if (isAdminEmail(normalized)) return "admin";
  const row = await getUserRole(normalized);
  return row?.role === "admin" ? "admin" : "member";
}

export const getUserRole = cache(async (
  email: string,
): Promise<UserRoleRow | null> => {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return cachedLoad(`user_roles:${normalized}`, async () => {
    if (useFirestore()) {
      const snap = await adminDb()!
        .collection("user_roles")
        .doc(normalized)
        .get();
      if (!snap.exists) return null;
      const data = snap.data() as Record<string, unknown>;
      return {
        email: normalized,
        role: normalizeRole(data.role),
        updated_at: String(data.updated_at ?? nowIso()),
        updated_by: (data.updated_by as string | null) ?? null,
      };
    }
    const db = await loadLocal();
    return db.roles.find((r) => r.email === normalized) ?? null;
  });
});

export async function listUserRoles(): Promise<UserRoleRow[]> {
  if (useFirestore()) {
    const snap = await adminDb()!.collection("user_roles").get();
    return snap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        if (data._meta === true) return null;
        const email = String(data.email ?? d.id)
          .trim()
          .toLowerCase();
        if (!email) return null;
        return {
          email,
          role: normalizeRole(data.role),
          updated_at: String(data.updated_at ?? nowIso()),
          updated_by: (data.updated_by as string | null) ?? null,
        } satisfies UserRoleRow;
      })
      .filter((r): r is UserRoleRow => r != null)
      .sort((a, b) => a.email.localeCompare(b.email));
  }
  const db = await loadLocal();
  return [...db.roles].sort((a, b) => a.email.localeCompare(b.email));
}

export async function setUserRole(input: {
  email: string;
  role: "admin" | "member";
  updatedBy: string | null;
}): Promise<UserRoleRow> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required.");
  if (isAdminEmail(email) && input.role !== "admin") {
    throw new Error(
      `Cannot demote the primary admin (${adminEmail()}).`,
    );
  }
  const row: UserRoleRow = {
    email,
    role: input.role,
    updated_at: nowIso(),
    updated_by: input.updatedBy,
  };
  if (useFirestore()) {
    await adminDb()!.collection("user_roles").doc(email).set(row);
    invalidateStoreCache();
    return row;
  }
  const db = await loadLocal();
  const idx = db.roles.findIndex((r) => r.email === email);
  if (idx >= 0) db.roles[idx] = row;
  else db.roles.push(row);
  await saveLocal(db);
  invalidateStoreCache();
  return row;
}

export async function deleteUserRole(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  if (isAdminEmail(normalized)) return;
  if (useFirestore()) {
    await adminDb()!.collection("user_roles").doc(normalized).delete();
    invalidateStoreCache();
    return;
  }
  const db = await loadLocal();
  db.roles = db.roles.filter((r) => r.email !== normalized);
  await saveLocal(db);
  invalidateStoreCache();
}

/** Ensure primary admin has an explicit role document. */
export async function ensurePrimaryAdminRole(): Promise<void> {
  const email = adminEmail();
  await setUserRole({
    email,
    role: "admin",
    updatedBy: "system",
  });
}
