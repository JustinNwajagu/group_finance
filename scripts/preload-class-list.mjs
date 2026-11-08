/**
 * Preload SHSN Class List 2007–2013 into Firestore members.
 * Title + name only; no email, phone, or login.
 *
 * Usage: node scripts/preload-class-list.mjs
 */
import { readFileSync } from "node:fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const MEMBERS = [
  ["Mr.", "Adama Kenenna"],
  ["Mr.", "Agbai Emmanuel"],
  ["Mr.", "Agbowo Vincent"],
  ["Mr.", "Agu Augustine"],
  ["Mr.", "Alachi Solomon"],
  ["Mr.", "Amahalu Chikasi"],
  ["Fr.", "Anike Damian"],
  ["Mr.", "Animba Maurice"],
  ["Mr.", "Anijedo Kennedy"],
  ["Fr.", "Chianu Onyedika"],
  ["Mr.", "Chigbo Pascal"],
  ["Mr.", "Chukwu Frank"],
  ["Mr.", "Ekeh Gerald"],
  ["Mr.", "Ekwunife Chiadi"],
  ["Mr.", "Enema Cyprian"],
  ["Mr.", "Eze Ugochukwu"],
  ["Mr.", "Ezeiyi Benjamin"],
  ["Mr.", "Ezedigwe Justin"],
  ["Mr.", "Ezeugwu Nnamdi"],
  ["Mr.", "Igboji Lawrence"],
  ["Mr.", "Ikejide Tochukwu"],
  ["Mr.", "Ilonze Chibundo"],
  ["Dr.", "Iyi Clinton"],
  ["Mr.", "Mazi Victor"],
  ["Mr.", "Mbaneme Lotachukwu"],
  ["Fr.", "Mbiaku ChukwuEbuka"],
  ["Mr.", "Nnia-Okolo Lotanna"],
  ["Mr.", "Nevo Francis"],
  ["Mr.", "Njinwamu Kosisochukwu"],
  ["Mr.", "Nsiadu Festus"],
  ["Mr.", "Nwabulsi Lotachukwu"],
  ["Fr.", "Nwafor Michael"],
  ["Mr.", "Nwajagu Obinna"],
  ["Mr.", "Nweke Chizoba"],
  ["Mr.", "Nweze Sylvester"],
  ["Mr.", "Nwanze Stephen"],
  ["Fr.", "Odimma John"],
  ["Mr.", "Offiah Raymond"],
  ["Mr.", "Ogbu Abel"],
  ["Mr.", "Ogbu Camilius"],
  ["Mr.", "Ogbu Innocent"],
  ["Mr.", "Okafor Vincent"],
  ["Mr.", "Okonkwo Emmanuel"],
  ["Mr.", "Okoye Vincent"],
  ["Mr.", "Omeke Munachi"],
  ["Mr.", "Ononugbo Festus"],
  ["Mr.", "Onwuegbu Emmanuel"],
  ["Engr.", "Onyia Henry"],
  ["Mr.", "Onyia Hillary"],
  ["Mr.", "Oshim Chisom"],
  ["Fr.", "Ossai Joshua"],
  ["Mr.", "Oyigbo John Francis"],
  ["Mr.", "Ozioko Ifeanyi"],
  ["Dr.", "Ozochi Chukwuma"],
  ["Mr.", "Ozongwu Benedict"],
  ["Dr.", "Uche Collins"],
  ["Fr.", "Ude Stephen"],
  ["Mr.", "Udeh Ikenna"],
  ["Mr.", "Udeh Chidera"],
  ["Fr.", "Udeh Franklyn"],
  ["Mr.", "Udeoba Donald"],
  ["Mr.", "Ugwu Stephen"],
  ["Mr.", "Ugwu Thaddeus"],
  ["Mr.", "Ukwuaniozor Ebube"],
  ["Mr.", "Umeaduma Francis"],
  ["Mr.", "Umeh Chidalu"],
  ["Barr.", "Umeh Chidubem"],
  ["Mr.", "Uzuakpundu Victor"],
];

function loadEnv() {
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
}

loadEnv();

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

async function nextMemberId() {
  const ref = db.collection("_counters").doc("members");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
    const next = current + 1;
    tx.set(ref, { value: next }, { merge: true });
    return next;
  });
}

function displayName(title, name) {
  return `${title} ${name}`.replace(/\s+/g, " ").trim();
}

async function existingNames() {
  const snap = await db.collection("members").get();
  const names = new Set();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data?._meta || !Number.isFinite(Number(data?.id))) continue;
    if (typeof data.name === "string") {
      names.add(data.name.trim().toLowerCase());
    }
  }
  return names;
}

const already = await existingNames();
let created = 0;
let skipped = 0;

for (const [title, name] of MEMBERS) {
  const full = displayName(title, name);
  if (already.has(full.toLowerCase())) {
    skipped += 1;
    console.log(`skip  ${full}`);
    continue;
  }
  const id = await nextMemberId();
  const created_at = new Date().toISOString();
  await db
    .collection("members")
    .doc(String(id))
    .set({
      id,
      name: full,
      title,
      email: null,
      phone: null,
      auth_uid: null,
      login_email: null,
      created_at,
      created_at_ts: FieldValue.serverTimestamp(),
    });
  already.add(full.toLowerCase());
  created += 1;
  console.log(`add   #${id} ${full}`);
}

const after = await db.collection("members").get();
const roster = after.docs
  .map((d) => d.data())
  .filter((d) => !d._meta && Number.isFinite(Number(d.id)));
const withLogin = roster.filter((m) => m.auth_uid).length;

console.log(
  JSON.stringify(
    {
      created,
      skipped,
      totalMembers: roster.length,
      linkedLogins: withLogin,
    },
    null,
    2,
  ),
);
