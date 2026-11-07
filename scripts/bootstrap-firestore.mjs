#!/usr/bin/env node
/**
 * Ensures Firestore counters for KLEF Ledger:
 *   members, payment_requests, payments, _counters
 *
 * Does not write placeholder docs into data collections (those were
 * incorrectly treated as rows). Collections appear on first real write.
 *
 * Requires Admin credentials:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
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
const collections = ["members", "payment_requests", "payments"];

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

async function removeLegacySchema(collection) {
  const ref = db.collection(collection).doc("_schema");
  const snap = await ref.get();
  if (snap.exists) {
    await ref.delete();
    console.log(`  removed legacy ${collection}/_schema`);
  }
}

console.log(`Bootstrapping Firestore for project ${projectId}…`);
for (const name of collections) {
  console.log(`\n${name}`);
  await removeLegacySchema(name);
  await ensureCounter(name);
}

console.log("\nDone. Counters ready; app creates real rows on use.");
process.exit(0);
