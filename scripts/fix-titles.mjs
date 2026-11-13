#!/usr/bin/env node
/**
 * One-off data fixes:
 * 1) Rename historical backlog “grand mom” → “Dads Memorial service”
 * 2) Rewrite dues titles Sept–Sept → Sept–Aug
 *
 * Usage: node scripts/fix-titles.mjs
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

function normalizeDuesTitle(title) {
  if (typeof title !== "string") return title;
  return title.replace(
    /\(Sept\s+(\d{4})\s*[–-]\s*Sept\s+(\d{4})\)/gi,
    (_m, start, end) => `(Sept ${start}–Aug ${end})`,
  );
}

function looksLikeGrandMom(text) {
  if (typeof text !== "string") return false;
  const t = text.toLowerCase();
  return (
    t.includes("grand mom") ||
    t.includes("grandmom") ||
    t.includes("grandma") ||
    (t.includes("obinna") && t.includes("grand"))
  );
}

async function fixDuesSchedules() {
  const snap = await db.collection("dues_schedules").get();
  let updated = 0;
  for (const doc of snap.docs) {
    if (doc.data()?._meta) continue;
    const title = doc.data()?.title;
    const next = normalizeDuesTitle(title);
    if (typeof title === "string" && next !== title) {
      await doc.ref.update({ title: next });
      console.log(`dues_schedules/${doc.id}: "${title}" → "${next}"`);
      updated += 1;
    }
  }
  return updated;
}

async function fixPaymentRequests() {
  const snap = await db.collection("payment_requests").get();
  let updated = 0;
  for (const doc of snap.docs) {
    if (doc.data()?._meta) continue;
    const title = doc.data()?.title;
    if (!looksLikeGrandMom(title)) continue;
    await doc.ref.update({ title: "Dads Memorial service" });
    console.log(`payment_requests/${doc.id}: "${title}" → "Dads Memorial service"`);
    updated += 1;
  }
  return updated;
}

async function fixExpenses() {
  const snap = await db.collection("expenses").get();
  let updated = 0;
  for (const doc of snap.docs) {
    if (doc.data()?._meta) continue;
    const data = doc.data() || {};
    const patch = {};
    const memorialNote =
      "Historical backlog: Nwajagu Obinna Dads Memorial service 2021, Akpugoeze. Amount unknown — placeholder ₦0";
    if (
      looksLikeGrandMom(data.notes) ||
      (typeof data.notes === "string" &&
        data.notes.toLowerCase().includes("dads memorial"))
    ) {
      patch.notes = memorialNote;
    }
    if (looksLikeGrandMom(data.contribution_title)) {
      patch.contribution_title = memorialNote;
    }
    if (Object.keys(patch).length === 0) continue;
    await doc.ref.update(patch);
    console.log(`expenses/${doc.id}:`, patch);
    updated += 1;
  }
  return updated;
}

const dues = await fixDuesSchedules();
const payments = await fixPaymentRequests();
const expenses = await fixExpenses();
console.log(
  `Done. Updated ${dues} dues schedule(s), ${payments} contribution title(s), ${expenses} expense(s).`,
);
