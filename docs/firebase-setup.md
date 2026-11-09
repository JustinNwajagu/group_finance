# Firebase setup (KLEF Ledger)

The app uses **Firebase Authentication**, **Cloud Firestore**, and **Firebase App Hosting** (Next.js server runtime on Cloud Run + CDN).

## Admin rule

Primary admin mailbox (always admin):

```bash
ADMIN_EMAIL=klef2007.2013@gmail.com
```

Other users default to **member**. Admins can assign `admin` / `member` roles on the Access page (`user_roles` collection).

## 1. Create a Firebase project

1. [Firebase console](https://console.firebase.google.com/) → add project.
2. Enable **Authentication** → Sign-in methods → Email/Password and Google.
3. Create a **Firestore** database (production mode is fine — rules deny client access; the Next.js server uses the Admin SDK).
4. Register a **Web app** and copy the config into `.env.local` (see `.env.example`).
5. Create a **service account** (Project settings → Service accounts → Generate new private key) and set:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (keep `\n` escapes)

## 2. Deploy (recommended: GitHub → App Hosting)

This is a full Next.js app (Server Components, Server Actions, Admin SDK). Host it with **Firebase App Hosting**, not classic static Hosting alone.

### One-time console setup

1. Push this repo to GitHub (`JustinNwajagu/group_finance`).
2. Firebase console → **Hosting & Serverless → App Hosting** → create a backend.
3. Connect the GitHub repo, set the app root to `/` (where `package.json` lives), live branch **`main`**, enable **automatic rollouts**.
4. Create secrets (once per project) and grant App Hosting access:

```bash
npm install -g firebase-tools
firebase login
firebase use klefapp

# Create/update each secret (CLI prompts to grant access + optionally update apphosting.yaml)
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_API_KEY
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_PROJECT_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_APP_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
firebase apphosting:secrets:set FIREBASE_PROJECT_ID
firebase apphosting:secrets:set FIREBASE_CLIENT_EMAIL
firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY
```

`apphosting.yaml` already references those secret names. Console env values override the YAML if both are set.

5. Attach a custom domain in the App Hosting backend settings when ready.
6. Authorized domains: Authentication → Settings → Authorized domains. Add your App Hosting / custom domain. `localhost` is included by default; add `127.0.0.1` if you preview on that host. Unauthorized continue URLs used to block reset emails — the app now falls back to a plain reset email when the domain is missing.
7. Authentication → Sign-in method → enable **Email/Password**. Password reset emails use Firebase’s built-in mailer (Templates tab to customize). Those messages often land in spam until you move to a custom SMTP / authenticated sending domain (Blaze + Authentication email templates / SMTP settings).

### Continuous delivery

- **CD:** every push to `main` triggers an App Hosting build + rollout (GitHub connection).
- **CI:** `.github/workflows/ci.yml` runs lint, `tsc`, and `next build` on pull requests and on `main` (placeholder env only — real secrets stay in Secret Manager).
- Prefer merging via PR so CI gates the rollout that happens after merge to `main`.

### Manual / non-GitHub deploy (optional)

```bash
firebase apphosting:backends:list
firebase apphosting:rollouts:create <BACKEND_ID>
# or deploy local source without GitHub — see Firebase “alternative ways to deploy”
```

`firebase.json` only configures Firestore rules. App Hosting (via `apphosting.yaml` + the GitHub connection) is the deploy path.

## 3. Local without Firebase credentials

`npm run dev` uses a **file-backed local store** (`data/local-store.json`) and a **dev login** form on `/login`. Sign in as `ADMIN_EMAIL` for admin, or any other email for member.

## Collections

| Collection | Purpose |
| --- | --- |
| `members` | Roster |
| `payment_requests` | Shared payment titles (min ₦, deadline, conclude) |
| `payments` | Per-member pledge/paid rows |
| `_counters` | Numeric id sequences |

Full field list and why `payment_requests` is needed: [database-schema.md](./database-schema.md).

### Bootstrap from this repo

Once Admin credentials are in the environment (or `.env.local`):

```bash
# load env then:
set -a && source .env.local && set +a
npm run firestore:bootstrap
```

That creates `_schema` markers + `_counters` for `members`, `payment_requests`, and `payments`. Real rows are written by the app.
