# Shared Expenses App — Feature Plan

Stack: Bun + Express + Prisma + PostgreSQL (backend) | React + Vite (frontend) | Railway/Render (deploy)

---

## Phase 0: Project Bootstrap

- [ ] Init monorepo structure (`apps/api`, `apps/web`, `packages/db`)
- [ ] Configure `bun` workspaces in root `package.json`
- [ ] Add shared `tsconfig.json` base
- [ ] Add shared ESLint config
- [ ] Add `.env.example` for both apps
- [ ] Add `README.md` skeleton (setup instructions, stack, AI tools used)
- [ ] Add `SCOPE.md` skeleton (anomaly log + schema section)
- [ ] Add `DECISIONS.md` skeleton
- [ ] Add `AI_USAGE.md` skeleton
- [ ] Set up git with `.gitignore` and make first commit

---

## Phase 1: Database Schema & Migrations

### 1.1 Core Tables
- [ ] `users` — `id`, `name`, `email`, `password_hash`, `created_at`
  - Dev must be a row here (he is `paid_by` in the CSV); absence would break the FK on `expenses.paid_by_user_id`
  - Dev has no `group_memberships` row — his participation is as a visitor, not a flat member
- [ ] `guests` — `id`, `name`, `added_by_user_id`, `created_at`
  - Kabir (and any future one-off participants) live here, not in `users`
  - `expense_splits` references either `user_id` (FK → users) OR `guest_id` (FK → guests), never both; enforce with a check constraint
- [ ] `groups` — `id`, `name`, `created_at`
- [ ] `group_memberships` — `id`, `user_id`, `group_id`, `joined_at`, `left_at` (nullable)
  - Sam's `joined_at` must be decided before seeding — see DECISIONS.md item below
- [ ] `expenses` — `id`, `group_id`, `paid_by_user_id` (FK → users), `description`, `amount_original` (numeric), `amount_original_currency`, `converted_amount_inr`, `date`, `split_type` (enum: equal, unequal, percentage, share), `notes`, `source` (manual | import), `created_at`, `deleted_at` (nullable — soft delete)
  - Rule: **only `users` can be `paid_by`**; guests can owe money but cannot be the payer. This means a true walk-in who fronts cash must be entered as a `users` row (like Dev), not a `guests` row. Document in DECISIONS.md.
- [ ] `expense_splits` — `id`, `expense_id`, `user_id` (FK → users, nullable), `guest_id` (FK → guests, nullable), `owed_amount`
  - Check constraint: exactly one of `user_id` / `guest_id` must be non-null
- [ ] `settlements` — `id`, `group_id`, `from_user_id`, `to_user_id`, `amount`, `currency`, `date`, `notes`, `created_at`
- [ ] `exchange_rates` — `id`, `from_currency`, `to_currency`, `rate`, `effective_date`, `source`
- [ ] `import_sessions` — `id`, `group_id`, `filename`, `status` (pending | reviewed | committed), `created_at`
  - Abandoned sessions (never committed) accumulate dead rows; document TTL cleanup job in DECISIONS.md (e.g. auto-delete sessions older than 24 h that are still `pending`)
- [ ] `import_anomalies` — `id`, `session_id`, `row_number`, `anomaly_type`, `description`, `raw_row` (jsonb), `resolution` (enum: auto_fixed | user_approved | user_rejected | pending), `resolution_notes`, `edited_value` (jsonb, nullable — stores inline edits made by user during review)
- [ ] `import_rows` — `id`, `session_id`, `row_number`, `raw_data` (jsonb), `status` (staged | committed | rejected), `mapped_expense_id` (nullable), `mapped_settlement_id` (nullable)

### 1.2 Enum Types
- [ ] `split_type_enum`: equal, unequal, percentage, share
- [ ] `resolution_enum`: auto_fixed, user_approved, user_rejected, pending
- [ ] `import_status_enum`: pending, reviewed, committed
- [ ] `import_row_status_enum`: staged, committed, rejected
  - Used by `import_rows.status` — must be a declared type, not a plain varchar, to match the pattern of all other enums

### 1.3 Prisma Setup
- [ ] Configure Prisma with PostgreSQL dialect
- [ ] Write all table schemas in `packages/db/schema.ts`
- [ ] Generate and run initial migration
- [ ] Export typed query helpers

### 1.4 Seed Data
- [ ] Seed canonical members: Aisha, Rohan, Priya, Meera, Dev, Sam
  - Dev gets a `users` row (required for FK integrity as `paid_by`); no `group_memberships` row
- [ ] Seed default group "The Flat"
- [ ] Seed group memberships with correct `joined_at`/`left_at` dates:
  - Aisha, Rohan, Priya, Meera: joined Feb 1 2026
  - Meera: left March 31 2026
  - Sam: `joined_at` = **decision required before writing this seed** — see DECISIONS.md
    - Option A: April 8 (deposit date, row 38 in CSV) — but row 38 is a settlement candidate
    - Option B: April 10 (housewarming drinks, row 39) — first shared expense he actually participates in
    - Chosen date must be documented; seed must match DECISIONS.md
- [ ] Seed USD→INR exchange rate (document source in DECISIONS.md)

---

## Phase 2: Authentication

### 2.1 Backend (Express)
- [ ] `POST /auth/register` — email + password, bcrypt hash
- [ ] `POST /auth/login` — returns signed JWT
- [ ] `POST /auth/logout`
- [ ] JWT middleware (`isAuthenticated`) for protected routes
- [ ] Error response shape: `{ error: { code, message } }`

### 2.2 Frontend
- [ ] Login page (email + password form)
- [ ] Register page
- [ ] Store JWT in `localStorage` / secure cookie
- [ ] Auth guard HOC / route wrapper
- [ ] Redirect unauthenticated users to `/login`
- [ ] Redirect authenticated users away from `/login`

---

## Phase 3: Groups & Membership

### 3.1 Backend
- [ ] `GET /groups` — list groups for current user
- [ ] `POST /groups` — create group
- [ ] `GET /groups/:id` — group detail + current members
- [ ] `POST /groups/:id/members` — add member with `joined_at`
- [ ] `PATCH /groups/:id/members/:userId` — set `left_at` (member leaves)
- [ ] Membership window validator — given a date, return active members at that date

### 3.2 Frontend
- [ ] Groups list page
- [ ] Create group modal/form
- [ ] Group detail page (shows current + past members with dates)
- [ ] Add member UI (name + join date)
- [ ] Mark member as left UI (leave date picker)

---

## Phase 4: Expenses — CRUD

### 4.1 Split Type Logic (pure functions, no DB)
- [ ] `splitEqual(amount, members[])` — divide evenly, handle rounding remainder on first member
- [ ] `splitUnequal(splits: {userId, amount}[])` — validate sum equals total
- [ ] `splitPercentage(amount, splits: {userId, pct}[])` — validate percentages sum to 100, compute amounts
- [ ] `splitShare(amount, splits: {userId, weight}[])` — compute proportional shares
- [ ] Unit tests for each split function (edge cases: rounding, zero, one member)

### 4.2 Backend
- [ ] `GET /groups/:id/expenses` — paginated list, filterable by date range
- [ ] `POST /groups/:id/expenses` — create expense + splits in a transaction
  - Validate paid_by is/was a member on that date (membership window check)
  - Validate split_with members are/were active on that date
  - Apply correct split function
- [ ] `GET /groups/:id/expenses/:expenseId` — detail with splits breakdown
- [ ] `PATCH /groups/:id/expenses/:expenseId` — update (recalculate splits)
- [ ] `DELETE /groups/:id/expenses/:expenseId` — soft delete

### 4.3 Frontend
- [ ] Expenses list page (per group)
  - [ ] Show date, description, paid_by, amount, split_type
  - [ ] Expand row to see per-person splits (Rohan's traceability requirement)
- [ ] Add expense form
  - [ ] Date picker
  - [ ] Paid-by dropdown (members active on selected date)
  - [ ] Amount + currency selector (INR / USD)
  - [ ] Split type selector (equal / unequal / percentage / share)
  - [ ] Dynamic split-with fields based on split type
  - [ ] Real-time split preview (shows each person's share)
  - [ ] Validation messages inline
- [ ] Edit expense form (prefilled)
- [ ] Delete confirmation dialog

---

## Phase 5: Settlements

### 5.1 Backend
- [ ] `GET /groups/:id/settlements` — list settlements
- [ ] `POST /groups/:id/settlements` — record a settlement (from/to/amount/date)
- [ ] `DELETE /groups/:id/settlements/:id` — remove settlement

### 5.2 Frontend
- [ ] Settlements list (per group)
- [ ] Record settlement form (who paid whom, amount, date)
- [ ] Settlement shown distinctly from expenses in UI

---

## Phase 6: Balance Calculation

### 6.1 Balance Engine (pure functions)
- [ ] `computeNetBalances(groupId, asOfDate?)` — sum expense_splits and settlements where `expense.date <= asOfDate` AND `settlement.date <= asOfDate`
  - The `asOfDate` filter applies to **expense dates and settlement dates**, not only membership windows
  - DB query must include `WHERE expenses.date <= $asOfDate` — not a post-filter in application code
  - **Guest splits are excluded from net balances.** `expense_splits` rows with a `guest_id` are informational only — they record what a guest owes for display purposes but are not included in any settlement calculation. Document in DECISIONS.md: "Guest shares are not tracked for settlement; only registered users appear in balance calculations."
- [ ] `decomposeBalance(userId, groupId)` — return list of expense IDs that compose a user's balance (Rohan's drill-down); only queries `expense_splits` where `user_id IS NOT NULL`
- [ ] `minimizeTransactions(netBalances)` — classic min-transactions greedy algorithm (Aisha's "one number" requirement)
  - Output: list of `{ from, to, amount }` settlement suggestions

### 6.2 Backend
- [ ] `GET /groups/:id/balances` — returns per-member net balances
- [ ] `GET /groups/:id/balances/summary` — returns minimal settlement suggestions
- [ ] `GET /groups/:id/balances/:userId` — per-user balance with expense breakdown (traceability)

### 6.3 Frontend
- [ ] Balance overview page (per group)
  - [ ] Per-member net balance card (+/- clearly labeled)
  - [ ] "Who pays whom" settlement suggestions (Aisha's view)
  - [ ] Click member to see expense breakdown list (Rohan's drill-down)
- [ ] Balance as-of-date filter (historical balance view)

---

## Phase 7: CSV Import Pipeline

### 7.1 Parser — Stage 1: Parse & Normalize (pure, no DB)
- [ ] Read CSV using a streaming parser (no manual string splits)
- [ ] Normalize each row:
  - [ ] Strip leading/trailing whitespace from all fields
  - [ ] Lowercase + trim `paid_by`, then fuzzy-match to canonical member names
  - [ ] Parse amount: strip commas, strip whitespace, parse float
  - [ ] Parse date: try ISO → DD/MM/YYYY → MM/DD/YYYY → "Mon DD" formats in order; flag ambiguous
  - [ ] Normalize currency: uppercase, default missing to INR (with warning flag)
  - [ ] Normalize `split_type`: lowercase, trim, map aliases
  - [ ] Parse `split_with`: semicolon-delimited, trim each name
  - [ ] Parse `split_details`: parse weighted/percentage string into structured map

### 7.2 Parser — Stage 2: Anomaly Detection
For each row, detect and annotate the following anomalies.
**One row can produce multiple `import_anomalies` records** — e.g. row 27 has both a trailing-whitespace payer and a missing-year date; the parser must emit one anomaly record per distinct problem type, not collapse them into one.

- [ ] **Exact duplicate** — same description (case-insensitive), date, amount, paid_by → flag both rows
- [ ] **Conflicting duplicate** — same description + date but different amount or paid_by → flag both, require user choice
- [ ] **Settlement as expense** — `split_type` is NaN/null OR description/notes contain keywords ("settlement", "paid back") and `split_with` is a single person → reclassify candidate
- [ ] **Negative amount** — treat as refund if notes support it; flag for user confirmation
- [ ] **Zero amount** — flag row, block import unless user approves skip
- [ ] **Malformed amount** — amount cannot be parsed to float after normalization → block row
- [ ] **Sub-paisa precision** — more than 2 decimal places → round and log
- [ ] **Unknown/unresolvable payer** — after fuzzy match, `paid_by` still unknown → block row
- [ ] **Missing payer** — `paid_by` is null/NaN → block row
- [ ] **Missing currency** — default to INR, flag with warning
- [ ] **Non-member in split** — name in `split_with` not in canonical member list and not a known guest → flag, offer to create guest record or exclude
- [ ] **Post-exit member in split** — member in `split_with` has `left_at` before expense date → warn, remove from split, recalculate shares
- [ ] **Pre-join member in split** — member in `split_with` has `joined_at` after expense date → warn, remove from split
- [ ] **Percentage sum != 100%** — block row; review UI must allow inline editing of percentages and re-validate before committing (approve/reject alone is insufficient — a blocked row with a typo must be fixable without re-uploading the whole CSV)
- [ ] **Ambiguous date format** — DD/MM vs MM/DD ambiguity (e.g. 04/05/2026) → flag, show both interpretations, require user selection
- [ ] **Inconsistent date format** — log format switch (warn only, still parse)
- [ ] **Type/detail mismatch** — `split_type = equal` but `split_details` has weights → use split_type, discard details, log warning
- [ ] **USD expense** — convert using stored exchange rate; log rate used
- [ ] **Non-INR/non-USD currency** — flag as unsupported, block row

### 7.3 Parser — Stage 3: Staging
- [ ] Create `import_session` record in DB
- [ ] Insert each raw row into `import_rows`
- [ ] Insert each detected anomaly into `import_anomalies` with status `pending`
- [ ] Return session ID to frontend
- [ ] **Orphan session cleanup**: sessions in `pending` status older than 24 hours are dead data; document and implement a cleanup job (cron or lazy delete on next upload) — document policy in DECISIONS.md

### 7.4 Import Review UI
- [ ] Upload CSV page (drag-and-drop or file picker)
- [ ] After upload, show import summary:
  - [ ] Total rows parsed
  - [ ] Rows with no issues (ready to commit)
  - [ ] Rows with auto-fixable anomalies (show what will be changed)
  - [ ] Rows blocked pending user decision
- [ ] Anomaly review list — one card per anomaly:
  - [ ] Show raw row data
  - [ ] Show anomaly description in plain English
  - [ ] Show proposed resolution
  - [ ] User can approve / reject / edit proposed resolution
  - [ ] For conflicting duplicates: show both rows side by side, radio to pick one
  - [ ] For ambiguous dates: show two interpretations, radio to pick
  - [ ] For unknown payer: text input to reassign or skip row
  - [ ] For settlement candidate: confirm reroute to settlements table
- [ ] "Commit Import" button — only enabled when zero `pending` anomalies remain
- [ ] After commit: show import report (every anomaly + action taken) — downloadable as JSON

### 7.5 Backend Import Endpoints
- [ ] `POST /groups/:id/import` — multipart upload, triggers parse + stage, returns session ID
- [ ] `GET /groups/:id/import/:sessionId` — get session status + anomalies
- [ ] `PATCH /groups/:id/import/:sessionId/anomalies/:anomalyId` — resolve anomaly (user decision)
- [ ] `POST /groups/:id/import/:sessionId/commit` — validates all resolved, commits rows to expenses/settlements tables
- [ ] `GET /groups/:id/import/:sessionId/report` — download anomaly report as JSON

---

## Phase 8: Currency Handling

- [ ] Seed exchange rates table with documented USD→INR rate for the trip period (March 2026)
- [ ] `convertToINR(amount, currency, date)` — looks up rate by date proximity
- [ ] All balance calculations use `converted_amount_inr` — never raw USD
- [ ] UI displays original currency + INR equivalent for USD expenses
- [ ] DECISIONS.md entry: fixed rate vs live rate, which source, why

---

## Phase 9: Documents & Deliverables

### 9.1 SCOPE.md
- [ ] Full anomaly catalog (all 20 found) with row references
- [ ] Policy decision for each anomaly type
- [ ] Database schema (ERD description or diagram)

### 9.2 DECISIONS.md
- [ ] Why settlements are a separate table from expenses
- [ ] How percentage splits that don't sum to 100% are handled (and why inline edit, not reject-only)
- [ ] USD conversion rate chosen, source, and rationale (fixed vs live)
- [ ] What "membership window" means and how it gates split calculation
- [ ] How the conflicting Thalassa duplicate is resolved
- [ ] Rounding strategy (where the remainder goes in equal splits)
- [ ] Guest handling (Dev, Kabir) — `users` vs `guests` table distinction and FK constraint design
- [ ] Why `import_anomalies` requires explicit user approval before commit
- [ ] Sam's `joined_at` date — which date was chosen and why
- [ ] Orphan import session TTL policy — duration, mechanism (cron vs lazy delete)

### 9.3 AI_USAGE.md
- [ ] List AI tools used
- [ ] Document key prompts
- [ ] At least 3 cases where AI produced something wrong, how it was caught, what was changed

### 9.4 README.md
- [ ] Prerequisites
- [ ] Local setup (clone → env → migrate → seed → dev)
- [ ] Running the import pipeline
- [ ] Deploy instructions

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
- [ ] Loading states on all async actions
- [ ] Error boundaries / toast notifications for API errors
- [ ] Empty states (no expenses yet, no anomalies, etc.)
- [ ] Confirm dialogs for destructive actions (delete expense, reject import row)
- [ ] Import report page accessible after commit (not just at commit time)
- [ ] Pagination on expenses list (avoid N+1 queries)
- [ ] Input validation client-side mirroring server-side rules

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

- [ ] `chore: bootstrap monorepo with bun workspaces`
- [ ] `feat: Prisma schema + initial migration`
- [ ] `feat: seed canonical members and membership windows`
- [ ] `feat: auth — register, login, JWT middleware`
- [ ] `feat: frontend — auth pages`
- [ ] `feat: groups CRUD + membership time-range endpoints`
- [ ] `feat: split calculation pure functions (equal/unequal/pct/share)`
- [ ] `feat: expenses CRUD with split validation`
- [ ] `feat: frontend — group and member management pages`
- [ ] `feat: frontend — expenses list and form`
- [ ] `feat: settlements CRUD`
- [ ] `feat: balance engine — net balances + minimize-transactions`
- [ ] `feat: frontend — balance overview with drill-down`
- [ ] `feat: CSV parser stage 1 — normalize`
- [ ] `feat: CSV parser stage 2 — anomaly detection`
- [ ] `feat: import pipeline — staging + session management`
- [ ] `feat: import review UI`
- [ ] `feat: import commit + report generation`
- [ ] `docs: SCOPE.md anomaly catalog complete`
- [ ] `docs: DECISIONS.md complete`
