import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ViewerContext } from "@/lib/auth";
import { isFirestore } from "@/lib/config";
import { adminDb } from "@/lib/firebase-admin";

export type AuditEvent = {
  id: string;
  created_at: string;
  actor_email: string;
  actor_name: string;
  actor_sub: string;
  view_as: "admin" | "member";
  /** Dotted verb, e.g. `dues.payment.record`. */
  action: string;
  /** Human-readable sentence for the changelog table. */
  summary: string;
  entity_type: string | null;
  entity_id: string | null;
};

export type AuditActor = Pick<
  ViewerContext,
  "email" | "name" | "sub" | "viewAs"
>;

type LocalAuditFile = {
  events: AuditEvent[];
};

const MAX_LIST = 300;
const MAX_LOCAL = 1000;

function auditFile() {
  return path.join(process.cwd(), "data", "audit-log.json");
}

async function loadLocal(): Promise<LocalAuditFile> {
  try {
    const raw = await readFile(auditFile(), "utf8");
    const parsed = JSON.parse(raw) as LocalAuditFile;
    return { events: Array.isArray(parsed.events) ? parsed.events : [] };
  } catch {
    return { events: [] };
  }
}

async function saveLocal(file: LocalAuditFile): Promise<void> {
  await mkdir(path.dirname(auditFile()), { recursive: true });
  await writeFile(auditFile(), JSON.stringify(file, null, 2));
}

function newId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Append an in-app change event. Never throws — audit must not block the
 * primary write if logging fails.
 */
export async function recordAudit(
  actor: AuditActor,
  input: {
    action: string;
    summary: string;
    entityType?: string | null;
    entityId?: string | number | null;
  },
): Promise<void> {
  try {
    const event: AuditEvent = {
      id: newId(),
      created_at: new Date().toISOString(),
      actor_email: actor.email.trim().toLowerCase(),
      actor_name: actor.name.trim() || actor.email.trim(),
      actor_sub: actor.sub,
      view_as: actor.viewAs === "member" ? "member" : "admin",
      action: input.action.trim(),
      summary: input.summary.trim(),
      entity_type: input.entityType?.trim() || null,
      entity_id:
        input.entityId == null || input.entityId === ""
          ? null
          : String(input.entityId),
    };

    if (isFirestore() && adminDb()) {
      await adminDb()!
        .collection("audit_logs")
        .doc(event.id)
        .set({ ...event, _meta: false });
      return;
    }

    const file = await loadLocal();
    file.events.unshift(event);
    if (file.events.length > MAX_LOCAL) {
      file.events = file.events.slice(0, MAX_LOCAL);
    }
    await saveLocal(file);
  } catch (err) {
    console.error("[audit] failed to record event", err);
  }
}

/** Actions shown on the admin Changelog (and still written going forward). */
export const CHANGELOG_ACTIONS = new Set([
  "contribution.open",
  "contribution.conclude",
  "contribution.reopen",
  "contribution.delete",
  "contribution.record",
  "contribution.clear",
  "contribution.mark_paid",
  "dues.year.open",
  "dues.year.conclude",
  "dues.year.delete",
  "dues.payment.record",
  "dues.payment.remove",
  "access.request.approve",
  "access.request.reject",
  "access.login.delete",
  "expense.record",
  "expense.certify",
  "expense.remove",
  "import.contributions",
  "import.dues",
]);

function isChangelogAction(action: string): boolean {
  return CHANGELOG_ACTIONS.has(action);
}

/** Newest-first changelog rows for the admin dash. */
export async function listAuditEvents(
  limit = MAX_LIST,
): Promise<AuditEvent[]> {
  const take = Math.min(Math.max(1, limit), MAX_LIST);

  if (isFirestore() && adminDb()) {
    try {
      // Over-fetch then filter so older noisy event types drop out of the UI.
      const snap = await adminDb()!
        .collection("audit_logs")
        .orderBy("created_at", "desc")
        .limit(Math.min(MAX_LIST * 2, 600))
        .get();
      return snap.docs
        .map((doc) => {
          const data = doc.data() as Partial<AuditEvent> & { _meta?: boolean };
          if (data._meta) return null;
          const action = String(data.action ?? "");
          if (!isChangelogAction(action)) return null;
          return {
            id: String(data.id ?? doc.id),
            created_at: String(data.created_at ?? ""),
            actor_email: String(data.actor_email ?? ""),
            actor_name: String(data.actor_name ?? ""),
            actor_sub: String(data.actor_sub ?? ""),
            view_as: data.view_as === "member" ? "member" : "admin",
            action,
            summary: String(data.summary ?? ""),
            entity_type: data.entity_type ? String(data.entity_type) : null,
            entity_id: data.entity_id != null ? String(data.entity_id) : null,
          } satisfies AuditEvent;
        })
        .filter((row): row is AuditEvent => row != null && Boolean(row.created_at))
        .slice(0, take);
    } catch (err) {
      console.error("[audit] list failed", err);
      return [];
    }
  }

  const file = await loadLocal();
  return file.events
    .filter((event) => isChangelogAction(event.action))
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, take);
}

/** Short label for action codes in the UI. */
export function formatAuditAction(action: string): string {
  const labels: Record<string, string> = {
    "access.request.approve": "Approve login",
    "access.request.reject": "Reject login",
    "access.login.delete": "Remove login",
    "contribution.open": "Open contribution",
    "contribution.conclude": "Archive contribution",
    "contribution.reopen": "Reopen contribution",
    "contribution.delete": "Delete contribution",
    "contribution.record": "Record contribution",
    "contribution.clear": "Clear contribution",
    "contribution.mark_paid": "Mark paid",
    "dues.year.open": "Open dues year",
    "dues.year.conclude": "Archive dues year",
    "dues.year.delete": "Delete dues year",
    "dues.payment.record": "Amend archived dues",
    "dues.payment.remove": "Remove archived dues payment",
    "expense.record": "Record expense",
    "expense.certify": "Certify expense",
    "expense.remove": "Remove expense",
    "import.contributions": "Import contributions",
    "import.dues": "Import dues",
  };
  return labels[action] ?? action;
}
