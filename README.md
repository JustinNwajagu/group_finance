# KLEF 13

Group financial record-keeping for Project SHSN_KLEF_2013.

## Stack

- Next.js App Router + TypeScript
- **Firebase Authentication** + **Cloud Firestore**
- Firebase App Hosting
- Currency: **Nigerian Naira (₦)**

## Local run

```bash
cp .env.example .env.local
# fill Firebase web + Admin SDK values
npm install
npm run dev
```

Open http://127.0.0.1:3000.

See `docs/firebase-setup.md` for Firebase project setup, and `docs/database-schema.md` for Firestore collections.

Optional one-time helpers:

```bash
npm run firestore:bootstrap
```

## Roles

- **Admin**: manage members, contributions, dues, access, and user roles
- **Member**: view roster, contributions, and dues
- Primary admin mailbox: `klef2007.2013@gmail.com` (locked admin)

## Deploy

Configure Firebase App Hosting / Hosting for this repo and set the same env vars in the hosting environment. Custom domain can be attached in the Firebase console.
