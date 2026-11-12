import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { adminEmail, isFirestore } from "./config";
import { EXCO_ADMIN_OFFICES, listExcoSeatViews } from "./exco";
import { adminDb } from "./firebase-admin";
import { formatTitledName } from "./name-titles";
import { getMemberById } from "./store";

export type AdminNotifyPayload = {
  kind: "access_request";
  requestId: number;
  email: string;
  title: string;
  name: string;
  phone: string;
};

type LocalMailDb = {
  messages: Array<{
    id: number;
    to: string[];
    subject: string;
    text: string;
    html: string;
    created_at: string;
  }>;
};

type GlobalMail = typeof globalThis & {
  __klefAdminMail?: LocalMailDb;
};

function mailFile() {
  return path.join(process.cwd(), "data", "admin-mail.json");
}

async function loadLocalMail(): Promise<LocalMailDb> {
  const g = globalThis as GlobalMail;
  if (g.__klefAdminMail) return g.__klefAdminMail;
  try {
    g.__klefAdminMail = JSON.parse(
      await readFile(mailFile(), "utf8"),
    ) as LocalMailDb;
  } catch {
    g.__klefAdminMail = { messages: [] };
  }
  return g.__klefAdminMail;
}

async function saveLocalMail(db: LocalMailDb): Promise<void> {
  const g = globalThis as GlobalMail;
  g.__klefAdminMail = db;
  await mkdir(path.dirname(mailFile()), { recursive: true });
  await writeFile(mailFile(), JSON.stringify(db, null, 2));
}

/** Admin mailboxes that should hear about access requests. */
export async function listAdminNotifyEmails(): Promise<string[]> {
  const emails = new Set<string>();
  emails.add(adminEmail());

  try {
    const seats = await listExcoSeatViews();
    for (const seat of seats) {
      if (!EXCO_ADMIN_OFFICES.includes(seat.office)) continue;
      if (seat.member_id == null) continue;
      const member = await getMemberById(seat.member_id);
      const login = (member?.login_email || member?.email || "")
        .trim()
        .toLowerCase();
      if (login.includes("@")) emails.add(login);
    }
  } catch {
    /* still notify primary admin */
  }

  return [...emails];
}

/**
 * Notify admins of a new login/account request.
 * Writes a Firebase Extension-compatible `mail` document when Firestore is on,
 * and always keeps a local copy for preview environments.
 */
export async function notifyAdminsOfAccessRequest(
  payload: AdminNotifyPayload,
): Promise<void> {
  const displayName = formatTitledName(payload.title, payload.name);
  const recipients = await listAdminNotifyEmails();
  if (recipients.length === 0) return;

  const subject = `KLEF 13: new login request from ${displayName}`;
  const text = [
    "A new account / login request needs approval.",
    "",
    `Name: ${displayName}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Request id: ${payload.requestId}`,
    "",
    "Open Access in KLEF Ledger to approve or reject this request.",
  ].join("\n");
  const html = `
    <p>A new account / login request needs approval.</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(displayName)}</li>
      <li><strong>Email:</strong> ${escapeHtml(payload.email)}</li>
      <li><strong>Phone:</strong> ${escapeHtml(payload.phone)}</li>
      <li><strong>Request id:</strong> ${payload.requestId}</li>
    </ul>
    <p>Open <strong>Access</strong> in KLEF Ledger to approve or reject this request.</p>
  `.trim();

  // Local / preview record so the attempt is always durable.
  try {
    const local = await loadLocalMail();
    local.messages.push({
      id: local.messages.length + 1,
      to: recipients,
      subject,
      text,
      html,
      created_at: new Date().toISOString(),
    });
    await saveLocalMail(local);
  } catch {
    /* non-fatal */
  }

  if (!isFirestore()) return;
  const db = adminDb();
  if (!db) return;

  // Firebase "Trigger Email" extension reads the `mail` collection.
  await db.collection("mail").add({
    to: recipients,
    message: {
      subject,
      text,
      html,
    },
    meta: {
      kind: payload.kind,
      request_id: payload.requestId,
      created_at: new Date().toISOString(),
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
