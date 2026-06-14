# Shared Expenses App — Feature Plan

Stack: Bun + Express + Prisma + PostgreSQL (backend) | React + Vite (frontend) | Railway/Render (deploy)

---

## Phase 0: Project Bootstrap

- [x] Init monorepo structure (`apps/api`, `apps/web`, `packages/db`)
- [x] Configure `bun` workspaces in root `package.json`
- [x] Add shared `tsconfig.json` base
- [x] Add shared ESLint config
- [x] Add `.env.example` for both apps
- [x] Add `README.md` skeleton (setup instructions, stack, AI tools used)
- [x] Add `SCOPE.md` skeleton (anomaly log + schema section)
- [x] Add `DECISIONS.md` skeleton
- [x] Add `AI_USAGE.md` skeleton
- [x] Set up git with `.gitignore` and make first commit

---

## Phase 1: Database Schema & Migrations

### 1.1 Core Tables
- [x] `users` — `id`, `name`, `email`, `password_hash`, `created_at`
  - Dev must be a row here (he is `paid_by` in the CSV); absence would break the FK on `expenses.paid_by_user_id`
  - Dev has no `group_memberships` row — his participation is as a visitor, not a flat member
- [x] `guests` — `id`, `name`, `added_by_user_id`, `created_at`
  - Kabir (and any future one-off participants) live here, not in `users`
  - `expense_splits` references either `user_id` (FK → users) OR `guest_id` (FK → guests), never both; enforce with a check constraint
- [x] `groups` — `id`, `name`, `created_at`
- [x] `group_memberships` — `id`, `user_id`, `group_id`, `joined_at`, `left_at` (nullable)
  - Sam's `joined_at` must be decided before seeding — see DECISIONS.md item below
- [x] `expenses` — `id`, `group_id`, `paid_by_user_id` (FK → users), `description`, `amount_original` (numeric), `amount_original_currency`, `converted_amount_inr`, `date`, `split_type` (enum: equal, unequal, percentage, share), `notes`, `source` (manual | import), `created_at`, `deleted_at` (nullable — soft delete)
  - Rule: **only `users` can be `paid_by`**; guests can owe money but cannot be the payer. This means a true walk-in who fronts cash must be entered as a `users` row (like Dev), not a `guests` row. Document in DECISIONS.md.
- [x] `expense_splits` — `id`, `expense_id`, `user_id` (FK → users, nullable), `guest_id` (FK → guests, nullable), `owed_amount`
  - Check constraint: exactly one of `user_id` / `guest_id` must be non-null
- [x] `settlements` — `id`, `group_id`, `from_user_id`, `to_user_id`, `amount`, `currency`, `date`, `notes`, `created_at`
- [x] `exchange_rates` — `id`, `from_currency`, `to_currency`, `rate`, `effective_date`, `source`
- [x] `import_sessions` — `id`, `group_id`, `filename`, `status` (pending | reviewed | committed), `created_at`
  - Abandoned sessions (never committed) accumulate dead rows; document TTL cleanup job in DECISIONS.md (e.g. auto-delete sessions older than 24 h that are still `pending`)
- [x] `import_anomalies` — `id`, `session_id`, `row_number`, `anomaly_type`, `description`, `raw_row` (jsonb), `resolution` (enum: auto_fixed | user_approved | user_rejected | pending), `resolution_notes`, `edited_value` (jsonb, nullable — stores inline edits made by user during review)
- [x] `import_rows` — `id`, `session_id`, `row_number`, `raw_data` (jsonb), `status` (staged | committed | rejected), `mapped_expense_id` (nullable), `mapped_settlement_id` (nullable)

### 1.2 Enum Types
- [x] `split_type_enum`: equal, unequal, percentage, share
- [x] `resolution_enum`: auto_fixed, user_approved, user_rejected, pending
- [x] `import_status_enum`: pending, reviewed, committed
- [x] `import_row_status_enum`: staged, committed, rejected
  - Used by `import_rows.status` — must be a declared type, not a plain varchar, to match the pattern of all other enums

### 1.3 Prisma Setup
- [x] Configure Prisma with PostgreSQL dialect
- [x] Write all table schemas in `packages/db/schema.ts`
- [x] Generate and run initial migration
- [x] Export typed query helpers

### 1.4 Seed Data
- [x] Seed canonical members: Aisha, Rohan, Priya, Meera, Dev, Sam
  - Dev gets a `users` row (required for FK integrity as `paid_by`); no `group_memberships` row
- [x] Seed default group "The Flat"
- [x] Seed group memberships with correct `joined_at`/`left_at` dates:
  - Aisha, Rohan, Priya, Meera: joined Feb 1 2026
  - Meera: left March 31 2026
  - Sam: `joined_at` = **decision required before writing this seed** — see DECISIONS.md
    - Option A: April 8 (deposit date, row 38 in CSV) — but row 38 is a settlement candidate
    - Option B: April 10 (housewarming drinks, row 39) — first shared expense he actually participates in
    - Chosen date must be documented; seed must match DECISIONS.md
- [x] Seed USD→INR exchange rate (document source in DECISIONS.md)

---

## Phase 2: Authentication

### 2.1 Backend (Express)
- [x] `POST /auth/register` — email + password, bcrypt hash
- [x] `POST /auth/login` — returns signed JWT
- [x] `POST /auth/logout`
- [x] JWT middleware (`isAuthenticated`) for protected routes
- [x] Error response shape: `{ error: { code, message } }`

### 2.2 Frontend
- [x] Login page (email + password form)
- [x] Register page
- [x] Store JWT in `localStorage` / secure cookie
- [x] Auth guard HOC / route wrapper
- [x] Redirect unauthenticated users to `/login`
- [x] Redirect authenticated users away from `/login`

---

## Phase 3: Groups & Membership

### 3.1 Backend
- [x] `GET /groups` — list groups for current user
- [x] `POST /groups` — create group
- [x] `GET /groups/:id` — group detail + current members
- [x] `POST /groups/:id/members` — add member with `joined_at`
- [x] `PATCH /groups/:id/members/:userId` — set `left_at` (member leaves)
- [x] Membership window validator — given a date, return active members at that date

### 3.2 Frontend
- [x] Groups list page
- [x] Create group modal/form
- [x] Group detail page (shows current + past members with dates)
- [x] Add member UI (name + join date)
- [x] Mark member as left UI (leave date picker)

---

## Phase 4: Expenses — CRUD

### 4.1 Split Type Logic (pure functions, no DB)
- [x] `splitEqual(amount, members[])` — divide evenly, handle rounding remainder on first member
- [x] `splitUnequal(splits: {userId, amount}[])` — validate sum equals total
- [x] `splitPercentage(amount, splits: {userId, pct}[])` — validate percentages sum to 100, compute amounts
- [x] `splitShare(amount, splits: {userId, weight}[])` — compute proportional shares
- [x] Unit tests for each split function (edge cases: rounding, zero, one member)

### 4.2 Backend
- [x] `GET /groups/:id/expenses` — paginated list, filterable by date range
- [x] `POST /groups/:id/expenses` — create expense + splits in a transaction
  - Validate paid_by is/was a member on that date (membership window check)
  - Validate split_with members are/were active on that date
  - Apply correct split function
- [x] `GET /groups/:id/expenses/:expenseId` — detail with splits breakdown
- [x] `PATCH /groups/:id/expenses/:expenseId` — update (recalculate splits)
- [x] `DELETE /groups/:id/expenses/:expenseId` — soft delete

### 4.3 Frontend
- [x] Expenses list page (per group)
  - [x] Show date, description, paid_by, amount, split_type
  - [x] Expand row to see per-person splits (Rohan's traceability requirement)
- [/] Add expense form
  - [x] Date picker
  - [x] Paid-by dropdown (members active on selected date)
  - [x] Amount + currency selector (INR / USD)
  - [ ] Split type selector (equal / unequal / percentage / share)
  - [ ] Dynamic split-with fields based on split type
  - [ ] Real-time split preview (shows each person's share)
  - [ ] Validation messages inline
- [ ] Edit expense form (prefilled)
- [ ] Delete confirmation dialog

---

## Phase 5: Settlements

### 5.1 Backend
- [x] `GET /groups/:id/settlements` — list settlements
- [x] `POST /groups/:id/settlements` — record a settlement (from/to/amount/date)
- [x] `DELETE /groups/:id/settlements/:id` — remove settlement

### 5.2 Frontend
- [x] Settlements list (per group)
- [x] Record settlement form (who paid whom, amount, date)
- [x] Settlement shown distinctly from expenses in UI

---

## Phase 6: Balance Calculation

### 6.1 Balance Engine (pure functions)
- [x] `computeNetBalances(groupId, asOfDate?)` — sum expense_splits and settlements where `expense.date <= asOfDate` AND `settlement.date <= asOfDate`
  - The `asOfDate` filter applies to **expense dates and settlement dates**, not only membership windows
  - DB query must include `WHERE expenses.date <= $asOfDate` — not a post-filter in application code
  - **Guest splits are excluded from net balances.** `expense_splits` rows with a `guest_id` are informational only — they record what a guest owes for display purposes but are not included in any settlement calculation. Document in DECISIONS.md: "Guest shares are not tracked for settlement; only registered users appear in balance calculations."
- [x] `decomposeBalance(userId, groupId)` — return list of expense IDs that compose a user's balance (Rohan's drill-down); only queries `expense_splits` where `user_id IS NOT NULL`
- [x] `minimizeTransactions(netBalances)` — classic min-transactions greedy algorithm (Aisha's "one number" requirement)
  - Output: list of `{ from, to, amount }` settlement suggestions

### 6.2 Backend
- [x] `GET /groups/:id/balances` — returns per-member net balances
- [x] `GET /groups/:id/balances/summary` — returns minimal settlement suggestions
- [x] `GET /groups/:id/balances/:userId` — per-user balance with expense breakdown (traceability)

### 6.3 Frontend
- [x] Balance overview page (per group)
  - [x] Per-member net balance card (+/- clearly labeled)
  - [x] "Who pays whom" settlement suggestions (Aisha's view)
  - [x] Click member to see expense breakdown list (Rohan's drill-down)
- [x] Balance as-of-date filter (historical balance view)

---

## Phase 7: CSV Import Pipeline

### 7.1 Parser — Stage 1: Parse & Normalize (pure, no DB)
- [x] Read CSV using a streaming parser (no manual string splits)
- [x] Normalize each row:
  - [x] Strip leading/trailing whitespace from all fields
  - [x] Lowercase + trim `paid_by`, then fuzzy-match to canonical member names
  - [x] Parse amount: strip commas, strip whitespace, parse float
  - [x] Parse date: try ISO → DD/MM/YYYY → MM/DD/YYYY → "Mon DD" formats in order; flag ambiguous
  - [x] Normalize currency: uppercase, default missing to INR (with warning flag)
  - [x] Normalize `split_type`: lowercase, trim, map aliases
  - [x] Parse `split_with`: semicolon-delimited, trim each name
  - [x] Parse `split_details`: parse weighted/percentage string into structured map

### 7.2 Parser — Stage 2: Anomaly Detection
For each row, detect and annotate the following anomalies.
**One row can produce multiple `import_anomalies` records** — e.g. row 27 has both a trailing-whitespace payer and a missing-year date; the parser must emit one anomaly record per distinct problem type, not collapse them into one.

- [x] **Exact duplicate** — same description (case-insensitive), date, amount, paid_by → flag both rows
- [x] **Conflicting duplicate** — same description + date but different amount or paid_by → flag both, require user choice
- [x] **Settlement as expense** — `split_type` is NaN/null OR description/notes contain keywords ("settlement", "paid back") and `split_with` is a single person → reclassify candidate
- [x] **Negative amount** — treat as refund if notes support it; flag for user confirmation
- [x] **Zero amount** — flag row, block import unless user approves skip
- [x] **Malformed amount** — amount cannot be parsed to float after normalization → block row
- [x] **Sub-paisa precision** — more than 2 decimal places → round and log
- [x] **Unknown/unresolvable payer** — after fuzzy match, `paid_by` still unknown → block row
- [x] **Missing payer** — `paid_by` is null/NaN → block row
- [x] **Missing currency** — default to INR, flag with warning
- [x] **Non-member in split** — name in `split_with` not in canonical member list and not a known guest → flag, offer to create guest record or exclude
- [x] **Post-exit member in split** — member in `split_with` has `left_at` before expense date → warn, remove from split, recalculate shares
- [x] **Pre-join member in split** — member in `split_with` has `joined_at` after expense date → warn, remove from split
- [x] **Percentage sum != 100%** — block row; review UI must allow inline editing of percentages and re-validate before committing (approve/reject alone is insufficient — a blocked row with a typo must be fixable without re-uploading the whole CSV)
- [x] **Ambiguous date format** — DD/MM vs MM/DD ambiguity (e.g. 04/05/2026) → flag, show both interpretations, require user selection
- [x] **Inconsistent date format** — log format switch (warn only, still parse)
- [x] **Type/detail mismatch** — `split_type = equal` but `split_details` has weights → use split_type, discard details, log warning
- [x] **USD expense** — convert using stored exchange rate; log rate used
- [x] **Non-INR/non-USD currency** — flag as unsupported, block row

### 7.3 Parser — Stage 3: Staging
- [x] Create `import_session` record in DB
- [x] Insert each raw row into `import_rows`
- [x] Insert each detected anomaly into `import_anomalies` with status `pending`
- [x] Return session ID to frontend
- [x] **Orphan session cleanup**: sessions in `pending` status older than 24 hours are dead data; document and implement a cleanup job (cron or lazy delete on next upload) — document policy in DECISIONS.md

### 7.4 Import Review UI
- [x] Upload CSV page (drag-and-drop or file picker)
- [x] After upload, show import summary:
  - [x] Total rows parsed
  - [x] Rows with no issues (ready to commit)
  - [x] Rows with auto-fixable anomalies (show what will be changed)
  - [x] Rows blocked pending user decision
- [x] Anomaly review list — one card per anomaly:
  - [x] Show raw row data
  - [x] Show anomaly description in plain English
  - [x] Show proposed resolution
  - [x] User can approve / reject / edit proposed resolution
  - [x] For conflicting duplicates: show both rows side by side, radio to pick one
  - [x] For ambiguous dates: show two interpretations, radio to pick
  - [x] For unknown payer: text input to reassign or skip row
  - [x] For settlement candidate: confirm reroute to settlements table
- [x] "Commit Import" button — only enabled when zero `pending` anomalies remain
- [x] After commit: show import report (every anomaly + action taken) — downloadable as JSON

### 7.5 Backend Import Endpoints
- [x] `POST /groups/:id/import` — multipart upload, triggers parse + stage, returns session ID
- [x] `GET /groups/:id/import/:sessionId` — get session status + anomalies
- [x] `PATCH /groups/:id/import/:sessionId/anomalies/:anomalyId` — resolve anomaly (user decision)
- [x] `POST /groups/:id/import/:sessionId/commit` — validates all resolved, commits rows to expenses/settlements tables
- [x] `GET /groups/:id/import/:sessionId/report` — download anomaly report as JSON

---

## Phase 8: Currency Handling

- [x] Seed exchange rates table with documented USD→INR rate for the trip period (March 2026)
- [x] `convertToINR(amount, currency, date)` — looks up rate by date proximity
- [x] All balance calculations use `converted_amount_inr` — never raw USD
- [x] UI displays original currency + INR equivalent for USD expenses
- [x] DECISIONS.md entry: fixed rate vs live rate, which source, why

---

## Phase 9: Documents & Deliverables

- [x] SCOPE.md
- [x] DECISIONS.md
- [x] AI_USAGE.md
- [x] README.md

---

## Phase 10: Deployment

- [ ] Provision PostgreSQL on Railway or Render
- [ ] Set environment variables (DATABASE_URL, JWT_SECRET, PORT)
- [ ] Configure build + start commands for API
- [ ] Configure build + start commands for web (static deploy or SSR)
- [ ] Run migrations against production DB
- [ ] Run seed for canonical members + exchange rates
- [ ] Smoke test: login → create group → upload CSV → commit import → check balances
- [ ] Confirm public URL is accessible
- [ ] Add public URL to README.md

---

## Phase 11: Polish & Edge Cases

- [ ] Responsive layout (mobile-friendly tables and forms)
- [x] Loading states on all async actions
- [x] Error boundaries / toast notifications for API errors
- [x] Empty states (no expenses yet, no anomalies, etc.)
- [x] Confirm dialogs for destructive actions (delete expense, reject import row)
- [x] Import report page accessible after commit (not just at commit time)
- [x] Pagination on expenses list (avoid N+1 queries)
- [x] Input validation client-side mirroring server-side rules

---

## Anomaly Coverage Checklist (from CSV)

Row numbers are 1-indexed from the raw file (row 1 = header, row 2 = first data row).
Verify against `csv_inputs/expenses_export.csv` before referencing in SCOPE.md.

- [ ] Rows 5+6 — exact duplicate: "Dinner at Marina Bites" / "dinner - marina bites" (same date, amount, payer)
- [ ] Row 7 — malformed amount: `"1,200"` (comma as thousands separator)
- [ ] Row 9 — case inconsistency: `paid_by = priya` → normalize to `Priya`
- [ ] Row 10 — sub-paisa precision: `899.995`
- [ ] Row 11 — unknown payer: `Priya S` (not in canonical list after fuzzy match)
- [ ] Row 13 — missing payer: `paid_by` is empty
- [ ] Row 14 — settlement logged as expense: "Rohan paid Aisha back", `split_type` is empty
- [ ] Row 15 — percentage sum != 100%: 30+30+30+20 = 110%
- [ ] Rows 16+ — inconsistent date formats: YYYY-MM-DD → DD/MM/YYYY → "Mar 14" → back
- [ ] Row 23 — non-member in split: "Dev's friend Kabir"
- [ ] Rows 24+25 — conflicting duplicate: Thalassa dinner (₹2400 vs ₹2450, different payers)
- [ ] Row 26 — negative amount: `-30 USD` (parasailing refund)
- [ ] Row 27 — **two anomalies on one row**: (a) trailing whitespace payer `rohan ` and (b) missing year in date "Mar 14" — parser emits two separate `import_anomalies` records for this row
- [ ] Row 28 — missing currency: `currency` is empty
- [ ] Row 29 — whitespace in amount: `" 1450 "` (leading + trailing spaces)
- [ ] Row 31 — zero amount: `amount = 0`
- [ ] Row 34 — ambiguous date: `04/05/2026` (April 5 or May 4?)
- [ ] Row 36 — post-exit member in split: Meera included in April 2 grocery split after leaving March 31
- [ ] Row 38 — settlement logged as expense: "Sam deposit share" (single recipient, deposit context)
- [ ] Row 42 — type/detail mismatch: `split_type = equal` but per-person share weights present in `split_details`

---

## Commit Milestones

Ordered to match a working, testable app at each phase. Frontend auth comes immediately after backend auth so every subsequent frontend page has a real login to test through.

- [x] `chore: bootstrap monorepo with bun workspaces`
- [x] `feat: Prisma schema + initial migration`
- [x] `feat: seed canonical members and membership windows`
- [x] `feat: auth — register, login, JWT middleware`
- [x] `feat: frontend — auth pages`
- [x] `feat: groups CRUD + membership time-range endpoints`
- [x] `feat: split calculation pure functions (equal/unequal/pct/share)`
- [x] `feat: expenses CRUD with split validation`
- [x] `feat: frontend — group and member management pages`
- [x] `feat: frontend — expenses list and form`
- [x] `feat: settlements CRUD`
- [x] `feat: balance engine — net balances + minimize-transactions`
- [x] `feat: frontend — balance overview with drill-down`
- [x] `feat: CSV parser stage 1 — normalize`
- [x] `feat: CSV parser stage 2 — anomaly detection`
- [x] `feat: import pipeline — staging + session management`
- [x] `feat: import review UI`
- [x] `feat: import commit + report generation`
- [x] `docs: SCOPE.md anomaly catalog complete`
- [x] `docs: DECISIONS.md complete`
