#!/usr/bin/env node
/**
 * Creates Firestore collections used by KLEF Ledger:
 *   members, payment_requests, payments, _counters
 *
 * Requires Admin credentials in the environment:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 * Usage:
 *   node scripts/bootstrap-firestore.mjs
 */

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.\n" +
      "Add them to .env.local (or export them), then re-run.",
  );
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const db = getFirestore();

const collections = [
  {
    name: "members",
    sample: false,
    note: "Roster documents: { id, name, email, created_at }",
  },
  {
    name: "payment_requests",
    sample: false,
    note: "Titles: { id, title, amount, deadline, concluded_at, created_at }",
  },
  {
    name: "payments",
    sample: false,
    note: "Rows: { id, payment_request_id, member_id, amount, status, payment_date, created_at }",
  },
];

async function ensureCounter(name) {
  const ref = db.collection("_counters").doc(name);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ value: 0 });
    console.log(`  created _counters/${name} = 0`);
  } else {
    console.log(`  exists  _counters/${name} = ${snap.data()?.value ?? 0}`);
  }
}

async function ensureMeta(collection, note) {
  const ref = db.collection(collection).doc("_schema");
  const snap = await ref.get();
  const payload = {
    _meta: true,
    description: note,
    bootstrapped_at: new Date().toISOString(),
  };
  if (!snap.exists) {
    await ref.set(payload);
    console.log(`  created ${collection}/_schema`);
  } else {
    await ref.set(payload, { merge: true });
    console.log(`  updated ${collection}/_schema`);
  }
}

console.log(`Bootstrapping Firestore for project ${projectId}…`);
for (const c of collections) {
  console.log(`\n${c.name}`);
  await ensureMeta(c.name, c.note);
  await ensureCounter(c.name);
}

console.log("\nDone. Collections are ready (Firestore creates them on first write).");
console.log("App writes real member/payment docs via the Admin SDK; clients cannot.");
process.exit(0);
