#!/usr/bin/env node
/**
 * Ensures Firestore counters + visible collection stubs for KLEF 13:
 *   members, payment_requests, payments, dues_schedules, dues_payments
 *
 * Stub docs use `_meta: true` so the app never treats them as data rows.
 *
 * Requires Admin credentials:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
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
    // env may already be exported
  }
}

loadEnv();

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

/**
 * Data collections the app uses (contributions vs dues are split).
 * `_init` stubs are only for collections that may otherwise be empty and
 * invisible in the Firebase console. Never stub `members` — real roster
 * rows already make that collection visible, and stubs inflate doc counts.
 */
const collections = [
  {
    name: "members",
    note: "Roster members (title + name; login linked later).",
    stub: false,
  },
  {
    name: "payment_requests",
    note: "Contribution payment titles (not dues).",
    stub: true,
  },
  {
    name: "payments",
    note: "Contribution payment rows (pledge/paid).",
    stub: true,
  },
  {
    name: "dues_schedules",
    note: "Dues years (Jan–Dec) with fixed monthly amount.",
    stub: true,
  },
  {
    name: "dues_payments",
    note: "Dues payments with covered_months.",
    stub: true,
  },
  {
    name: "access_requests",
    note: "Pending / decided login access requests.",
    stub: false,
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

async function ensureCollectionStub(name, note) {
  const ref = db.collection(name).doc("_init");
  const snap = await ref.get();
  const payload = {
    _meta: true,
    note,
    created_at: new Date().toISOString(),
  };
  if (!snap.exists) {
    await ref.set(payload);
    console.log(`  created ${name}/_init (collection visible in console)`);
  } else {
    await ref.set(payload, { merge: true });
    console.log(`  exists  ${name}/_init`);
  }
}

console.log(`Bootstrapping Firestore for project ${projectId}…`);
for (const { name, note, stub } of collections) {
  console.log(`\n${name}`);
  await ensureCounter(name);
  if (stub) {
    await ensureCollectionStub(name, note);
  } else {
    // Drop leftover visibility stubs that inflate document counts.
    const initRef = db.collection(name).doc("_init");
    if ((await initRef.get()).exists) {
      await initRef.delete();
      console.log(`  removed ${name}/_init`);
    } else {
      console.log(`  skip stub for ${name}`);
    }
  }
}

console.log("\nDone. Counters + dues/contribution collections are ready.");
process.exit(0);
