# Firebase setup (KLEF Ledger)

The app uses **Firebase Authentication**, **Cloud Firestore**, and **Firebase Hosting** (App Hosting / frameworks).

## Admin rule

Only one email is admin. Set:

```bash
ADMIN_EMAIL=justin.nwajagu@gmail.com
```

Every other signed-in user is a **member**. There is no invite/role table.

## 1. Create a Firebase project

1. [Firebase console](https://console.firebase.google.com/) → add project.
2. Enable **Authentication** → Sign-in methods → Email/Password and Google.
3. Create a **Firestore** database (production mode is fine — rules deny client access; the Next.js server uses the Admin SDK).
4. Register a **Web app** and copy the config into `.env.local` (see `.env.example`).
5. Create a **service account** (Project settings → Service accounts → Generate new private key) and set:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (keep `\n` escapes)

## 2. Deploy

```bash
npm install -g firebase-tools
firebase login
firebase experiments:enable webframeworks
firebase init hosting   # use existing firebase.json
firebase deploy
```

Or use **Firebase App Hosting** with `apphosting.yaml` and connect the GitHub repo.

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
