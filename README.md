# KLEF Ledger

Group financial record-keeping for Project SHSN_KLEF_2013.

## Stack

- Next.js App Router + TypeScript
- Postgres via Cursor publish-app (`DATABASE_URL`), with local PGlite fallback
- Cursor private/team identity (`cursor/identity.ts`)

## Local run

```bash
cd group-finance
npm install
env -u DATABASE_URL npm run dev
```

Open http://127.0.0.1:3000. Locally you are a simulated viewer (`cursor/identity.dev.ts`).

## Roles

- **Admin**: manage members, record payments, grant access / assign roles
- **Member**: view and filter members and payments; see contribution totals
- First signed-in person becomes admin when the access table is empty

## Publish

Publish as **private** (or team) so Cursor signs viewers in. Prefer private in the publish dialog.
