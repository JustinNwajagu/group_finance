# KLEF Ledger

Group financial record-keeping for Project SHSN_KLEF_2013.

## Stack

- Next.js App Router + TypeScript
- **Snowflake** for shared durable data (when secrets are set)
- Local **PGlite** sample store when Snowflake is unset
- Cursor private/team identity (`cursor/identity.ts`)
- Currency: **Nigerian Naira (₦)**

## Local run

```bash
cd group-finance
npm install
npm run dev
```

Open http://127.0.0.1:3000. Locally you are a simulated viewer (`cursor/identity.dev.ts` / `.js`).

## Snowflake

Set `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USERNAME`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA` (optional `SNOWFLAKE_ROLE`). Then `npm run migrate` / publish build applies `migrations/snowflake/`.

## Roles

- **Admin**: manage members, record payments, grant access / assign roles
- **Member**: view and filter; see contribution totals
- First signed-in person becomes admin when the access table is empty

## Publish

Publish as **private** (or team). Requires a GitHub/Origin-backed Cursor run. Prefer private in the publish dialog.
