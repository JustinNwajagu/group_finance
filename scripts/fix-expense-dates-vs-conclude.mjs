#!/usr/bin/env node
/**
 * Ensure contribution-funded expenses are not dated before the contribution
 * was concluded. Early dates are bumped to the conclude day.
 *
 * Usage:
 *   node scripts/fix-expense-dates-vs-conclude.mjs          # dry-run
 *   node scripts/fix-expense-dates-vs-conclude.mjs --apply  # write
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i);
      let value = line.slice(i + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  } catch {
    /* env may already be exported */
  }
}

loadEnv();

const apply = process.argv.includes("--apply");
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing Firebase Admin credentials in .env.local");
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const db = getFirestore();

async function main() {
  const [reqSnap, expSnap] = await Promise.all([
    db.collection("payment_requests").get(),
    db.collection("expenses").get(),
  ]);

  const reqs = new Map();
  for (const doc of reqSnap.docs) {
    const data = doc.data();
    if (!data || data._meta || data.type === "dues") continue;
    reqs.set(Number(data.id), data);
  }

  const fixes = [];
  for (const doc of expSnap.docs) {
    const expense = doc.data();
    if (!expense || expense._meta) continue;
    const requestId = Number(expense.payment_request_id);
    if (!Number.isFinite(requestId) || requestId <= 0) continue;
    if (Number(expense.contribution_amount ?? 0) <= 0.009) continue;
    const request = reqs.get(requestId);
    if (!request?.concluded_at) continue;
    const concludedDay = String(request.concluded_at).slice(0, 10);
    const expenseDate = String(expense.expense_date ?? "").slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(concludedDay) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)
    ) {
      continue;
    }
    if (expenseDate >= concludedDay) continue;
    fixes.push({
      ref: doc.ref,
      id: expense.id,
      title: request.title,
      from: expenseDate,
      to: concludedDay,
    });
  }

  if (fixes.length === 0) {
    console.log("No contribution-funded expenses dated before conclude day.");
    return;
  }

  console.log(`Found ${fixes.length} expense(s) to fix:`);
  for (const row of fixes) {
    console.log(
      `  #${row.id} “${row.title}” ${row.from} → ${row.to}${apply ? "" : " (dry-run)"}`,
    );
  }

  if (!apply) {
    console.log("Re-run with --apply to write changes.");
    return;
  }

  for (const row of fixes) {
    await row.ref.set({ expense_date: row.to }, { merge: true });
  }
  console.log(`Updated ${fixes.length} expense date(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
