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

export type AdminNotifyResult = {
  emailed: boolean;
  channel: "resend" | "smtp" | "firestore_mail" | "none";
  recipients: string[];
  error?: string;
};

type LocalMailDb = {
  messages: Array<{
    id: number;
    to: string[];
    subject: string;
    text: string;
    html: string;
    channel: string;
    created_at: string;
    error?: string;
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

function appBaseUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (raw) return raw.replace(/\/$/, "");
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (authDomain) {
    // Prefer the hosted app origin when known; fall back to Auth domain host.
    return `https://${authDomain.replace(/\.firebaseapp\.com$/i, ".web.app")}`;
  }
  return "";
}

function accessUrl(): string {
  const base = appBaseUrl();
  return base ? `${base}/access` : "/access";
}

/** Admin mailboxes that should hear about access requests. */
export async function listAdminNotifyEmails(): Promise<string[]> {
  const emails = new Set<string>();
  // Primary admin always gets the alert.
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

async function sendWithResend(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "KLEF 13 <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Resend failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`,
    );
  }
  return true;
}

async function sendWithSmtp(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return false;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    String(process.env.SMTP_SECURE ?? "").toLowerCase() === "true" ||
    port === 465;
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    `KLEF 13 <${user}>`;

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: { user, pass },
  });

  await transport.sendMail({
    from,
    to: input.to.join(", "),
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return true;
}

async function queueFirestoreMail(input: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  payload: AdminNotifyPayload;
}): Promise<boolean> {
  if (!isFirestore()) return false;
  const db = adminDb();
  if (!db) return false;

  // Firebase "Trigger Email" extension reads the `mail` collection.
  await db.collection("mail").add({
    to: input.to,
    message: {
      subject: input.subject,
      text: input.text,
      html: input.html,
    },
    meta: {
      kind: input.payload.kind,
      request_id: input.payload.requestId,
      created_at: new Date().toISOString(),
    },
  });
  return true;
}

/**
 * Notify admins of a new login/account request by email.
 * Prefers Resend, then SMTP, then Firestore `mail` (Trigger Email extension).
 */
export async function notifyAdminsOfAccessRequest(
  payload: AdminNotifyPayload,
): Promise<AdminNotifyResult> {
  const displayName = formatTitledName(payload.title, payload.name);
  const recipients = await listAdminNotifyEmails();
  if (recipients.length === 0) {
    return {
      emailed: false,
      channel: "none",
      recipients: [],
      error: "No admin recipients configured.",
    };
  }

  const link = accessUrl();
  const subject = `KLEF 13: new login request from ${displayName || payload.name}`;
  const shownName = displayName || payload.name;
  const text = [
    "A new account / login request needs approval.",
    "",
    `Name: ${shownName}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone || "—"}`,
    `Request id: ${payload.requestId}`,
    "",
    `Open Access to approve or reject: ${link}`,
  ].join("\n");
  const html = `
    <p>A new account / login request needs approval.</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(shownName)}</li>
      <li><strong>Email:</strong> ${escapeHtml(payload.email)}</li>
      <li><strong>Phone:</strong> ${escapeHtml(payload.phone || "—")}</li>
      <li><strong>Request id:</strong> ${payload.requestId}</li>
    </ul>
    <p><a href="${escapeHtml(link)}">Open Access</a> to approve or reject this request.</p>
  `.trim();

  let channel: AdminNotifyResult["channel"] = "none";
  let error: string | undefined;

  try {
    if (await sendWithResend({ to: recipients, subject, text, html })) {
      channel = "resend";
    } else if (await sendWithSmtp({ to: recipients, subject, text, html })) {
      channel = "smtp";
    } else if (
      await queueFirestoreMail({
        to: recipients,
        subject,
        text,
        html,
        payload,
      })
    ) {
      // Queued for the Trigger Email extension — not a direct send.
      channel = "firestore_mail";
    } else {
      error =
        "No email provider configured. Set RESEND_API_KEY (recommended) or SMTP_HOST/SMTP_USER/SMTP_PASS.";
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not send admin email.";
    channel = "none";
  }

  try {
    const local = await loadLocalMail();
    local.messages.push({
      id: local.messages.length + 1,
      to: recipients,
      subject,
      text,
      html,
      channel,
      created_at: new Date().toISOString(),
      error,
    });
    await saveLocalMail(local);
  } catch {
    /* non-fatal */
  }

  return {
    emailed: channel === "resend" || channel === "smtp",
    channel,
    recipients,
    error,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
