#!/usr/bin/env node
/**
 * Seed purpose + beneficiaries on the two currently open contributions:
 * - 2026 Priestly Ordination Levy → five ordinands
 * - Burial Levy for Our Brother Okonkwo Emmanuel's Dad → Okonkwo Emmanuel
 *
 * Usage: node scripts/seed-open-contribution-beneficiaries.mjs
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

/** @param {string} needle */
function nameMatches(memberName, needle) {
  const mn = String(memberName || "").toLowerCase();
  const parts = needle.toLowerCase().split(/\s+/).filter(Boolean);
  return parts.every((p) => mn.includes(p));
}

async function findMemberId(allMembers, needle) {
  const hits = allMembers.filter((m) => nameMatches(m.name, needle));
  if (hits.length === 0) {
    throw new Error(`No member matched “${needle}”`);
  }
  if (hits.length > 1) {
    // Prefer exact surname+given containment; take the first stable by id.
    hits.sort((a, b) => a.id - b.id);
  }
  return hits[0];
}

const SEEDS = [
  {
    titleIncludes: "priestly ordination",
    kind: "member",
    beneficiaryNames: [
      "Anike Damian",
      "Udeh Franklyn",
      "Ugwu Thaddeus",
      "Odimma John",
      "Amahalu Chikasi",
    ],
  },
  {
    titleIncludes: "okonkwo emmanuel",
    kind: "member",
    beneficiaryNames: ["Okonkwo Emmanuel"],
  },
];

async function main() {
  const [reqSnap, memSnap] = await Promise.all([
    db.collection("payment_requests").get(),
    db.collection("members").get(),
  ]);

  const members = memSnap.docs
    .map((d) => d.data())
    .filter((m) => m && !m._meta && m.id != null);

  const open = reqSnap.docs
    .map((d) => ({ ref: d.ref, data: d.data() }))
    .filter(
      ({ data }) =>
        data &&
        !data._meta &&
        data.type !== "dues" &&
        !data.concluded_at,
    );

  console.log(
    `Open contributions: ${open.map((o) => `#${o.data.id} ${o.data.title}`).join("; ") || "(none)"}`,
  );

  for (const seed of SEEDS) {
    const match = open.find(({ data }) =>
      String(data.title || "")
        .toLowerCase()
        .includes(seed.titleIncludes),
    );
    if (!match) {
      console.warn(`No open contribution matching “${seed.titleIncludes}”`);
      continue;
    }

    const beneficiaries = [];
    for (const name of seed.beneficiaryNames) {
      const member = await findMemberId(members, name);
      beneficiaries.push(member);
      console.log(`  ${name} → #${member.id} ${member.name}`);
    }

    const beneficiary_member_ids = [
      ...new Set(beneficiaries.map((m) => Number(m.id))),
    ];

    await match.ref.set(
      {
        kind: seed.kind,
        beneficiary_member_ids,
      },
      { merge: true },
    );
    console.log(
      `Updated #${match.data.id} “${match.data.title}” → kind=${seed.kind}, beneficiaries=[${beneficiary_member_ids.join(", ")}]`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
