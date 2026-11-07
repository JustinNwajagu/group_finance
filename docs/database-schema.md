# Database schema

Firestore uses **Firestore collections** (same shape in the local file store). Think of each collection as a table.

## Required tables

### 1. `members`

Roster of people who can be assigned contributions.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Primary key |
| `name` | string | Required |
| `email` | string \| null | Optional |
| `created_at` | ISO timestamp | |

### 2. `payments`

One row per **member × payment title** (pledge or paid).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Primary key |
| `payment_request_id` | number | FK → `payment_requests` |
| `member_id` | number | FK → `members` |
| `amount` | decimal string | ₦ amount for this member |
| `status` | `"pledge"` \| `"paid"` | Paid counts as contributed / realised |
| `payment_date` | date string \| null | Usually set when paid |
| `created_at` | ISO timestamp | |

Unique on (`payment_request_id`, `member_id`).

## Strongly recommended third table

### 3. `payment_requests`

**Keep this.** A flat `payments` table alone is not enough for how the app works.

Each “payment” in the UI is a **shared title** (e.g. funeral levy, dues) with one minimum amount, deadline, and conclude date for the whole group. Member rows hang off that title.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Primary key |
| `title` | string | Shown on Payments / Archive boards |
| `amount` | decimal string | Minimum expected per member |
| `deadline` | date string | |
| `concluded_at` | ISO timestamp \| null | Null = current; set = archived |
| `created_at` | ISO timestamp | |

Without `payment_requests` you would have to duplicate title/deadline/conclude on every member payment row and fight consistency when concluding or editing the title.

## Supporting collection (not a business table)

### `_counters`

Internal numeric ID sequences for `members`, `payment_requests`, and `payments`. Not user-facing.

## What you do **not** need

| Table | Why skip |
| --- | --- |
| `app_users` / roles | Firebase Auth identities; **admin** = `ADMIN_EMAIL` only, everyone else is **member** |
| Separate `pledges` table | Status on `payments` is enough |
| `audit_log` | Nice later; not required for v1 |

## Relationship sketch

```
payment_requests (1) ──< payments >── (1) members
     title, min ₦, deadline, concluded
                          amount, status, date
```

## Summary recommendation

Yes to **`members`** and **`payments`**. Also keep **`payment_requests`** as the third core table — it is what makes shared titles, deadlines, conclude/archive, and board totals work cleanly.
