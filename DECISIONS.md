# DECISIONS.md — Decisions Log

This log lists the significant architectural decisions, alternative options considered, and why they were made.

## 1. Separating Settlements from Expenses
- **Option A**: Store settlements as a special type of Expense.
- **Option B**: Maintain a separate `Settlement` table.
- **Decision**: Option B. Settlements do not have multiple splits, weights, or shared consumption. They are direct peer-to-peer transfers. Separating them prevents polluting splits logic and simplifies balance calculation.

## 2. Currency Rates Strategy
- **Option A**: Query live API on every import or run.
- **Option B**: Maintain historical seeded rate table. Use external API `https://open.er-api.com/v6/latest/INR` for updates and cache trip-period rates (seeded at 83.00 INR/USD for March 2026).
- **Decision**: Option B. Seeding static historical rates for the trip window (March 2026) ensures consistency and prevents external API downtime from blocking imports.

## 3. Membership Window & Active Dates
- **Option A**: Treat memberships as static boolean sets.
- **Option B**: Dynamic `joinedAt` and `leftAt` timestamps.
- **Decision**: Option B. Necessary to answer Sam's concern ("Why would March electricity affect my balance?"). Members only owe splits for expenses dated between their `joinedAt` and `leftAt` dates.
- Sam's `joinedAt` is set to **April 10, 2026** (Housewarming drinks). His deposit on April 8 is tracked as a Settlement, not an active membership expense trigger.
- Meera's `leftAt` is strictly **March 31, 2026**. She is excluded from the April 2 groceries split, trigger a post-exit anomaly, and other active members recalculate shares.

## 4. Guest Handling (Dev, Kabir)
- **Option A**: Create full User accounts for all participants.
- **Option B**: Add a lightweight `Guest` table for visitors/one-offs.
- **Decision**: Option B. Visitors like Kabir do not log in or need credentials, but splits must attribute their shares. True walk-ins who pay (like Dev) are given full `User` records because only users can be the `paid_by` payer in the DB schema.

## 5. Non-Member Payer Balance Inclusion (Dev)
- **Option A**: Exclude non-group-member payers from balance calculations entirely.
- **Option B**: Dynamically add any expense payer who is not a group member to the balance map with an initial balance of 0.
- **Decision**: Option B. Dev is a real user who fronted money for group expenses. Excluding his credits from balance calculations would produce incorrect net balances — the group would appear to collectively owe less than they actually do. Non-member payers are inserted into the balance map on-the-fly from the expense records. They appear in the output so users can see they are owed money.

## 6. Conflicting Duplicate Detection Scope
- **Option A**: Detect conflicting duplicates only for rows with a specific keyword (e.g. "thalassa").
- **Option B**: Use the general definition — same description (case-insensitive, trimmed) + same date + different amount or different payer — for all rows.
- **Decision**: Option B. The hardcoded keyword approach was a development artifact. The general rule correctly catches all conflicting duplicate patterns, including the Thalassa dinner case and any future conflicts without requiring code changes per case.

## 7. Percentage Invalid Sum — Auto-Equalize Resolution
- **Option A**: Require users to manually enter corrected percentages per person in an inline edit form.
- **Option B**: Provide an "auto-equalize" button that distributes 100% equally across all split members, with fractional remainder assigned to the first member.
- **Decision**: Option B for the initial version. A full inline editor would be more precise but adds significant UI complexity. The auto-equalize button covers the primary use case (typo in one percentage value). The equalization logic runs server-side at commit time when the frontend signals `percentages: {}` (empty overrides), keeping the UI simple and the calculation authoritative on the backend.

## 8. Orphan Import Session Cleanup
- **Option A**: Run a scheduled cron job to delete pending sessions older than 24 hours.
- **Option B**: Lazy delete on the next upload — check for stale sessions and remove them when a new upload is initiated.
- **Decision**: Option B for now. A cron requires a separate scheduled process. Lazy deletion on upload is simpler and has the same effective outcome since stale sessions block no resources. The policy is: sessions in `pending` status older than 24 hours are considered abandoned dead data. This will be implemented as a pre-upload cleanup step.

## 9. Cross-Import & Recurring Duplicate Detection
- **Problem**: Duplicate detection (`exact_duplicate`, `conflicting_duplicate`) only compared rows *within a single uploaded file*. Nothing compared a staged row against expenses already committed to the group. So re-uploading the same file — or two files with overlapping date ranges (`entry 1` in file1, then again in file2) — silently created duplicate expenses. But naively matching on description+payer+amount would wrongly flag legitimate recurring expenses (March rent vs April rent).
- **Option A**: Add a DB-level unique constraint on `(groupId, paidByUserId, date, description, amountOriginal)` to hard-block duplicates.
- **Option B**: Detect at the review layer with three tiers — exact cross-import match, recurring-period-aware match, and near-duplicate — surfacing each as a resolvable anomaly.
- **Decision**: Option B. A hard DB constraint would reject legitimate same-day identical expenses (e.g. two identical coffees) and offers no review path. The review-layer approach matches the existing anomaly pipeline and lets the user decide. Implemented in `import.ts` after staging:
  - **`cross_import_duplicate`** — exact match (normalized description + payer + date + amount) against a committed expense. Makes re-imports idempotent. Default action: Skip.
  - **`recurring_period_duplicate`** — the "smart" tier. Committed expenses are grouped into per-payer series keyed by `(normalized description, payer)`. A series is treated as recurring if it spans ≥2 distinct months, **or** matches a keyword (`rent`, `bill`, `electricity`, `internet`, `wifi`, `emi`, `maintenance`, …) with ≥1 prior instance. A row is flagged only if its **month is already booked**; a new month's instance (April rent when only March exists) passes through unflagged.
  - **`possible_double_entry`** — non-recurring rows matching an existing expense (same description + payer + amount) dated within 3 days but not identical — catches accidental same-period double-entry.
- **Scope decision**: Per-group only (not cross-group). Default resolution is Skip (safer), with an explicit "Import Anyway" override. Recurring detection is pattern-based (derived from the data) rather than a keyword whitelist; keywords only *lower the confidence threshold*. No schema migration was required — `anomalyType` is a free-form string and the commit path already handles `user_rejected` (skip) / `user_approved` (import).

## 10. Single-Payer / Single-Receiver Fields (no multi-select)
- **Context**: The expense form's `Paid By` and the settlement form's `Received By` are both single-select. Apps like Splitwise support *multi-payer* expenses (two people jointly front the money for one expense), so the question arose whether these fields should be multi-select.
- **Option A**: Model `Paid By` (and `Received By`) as multi-select to support jointly-paid expenses and split settlements.
- **Option B**: Keep both as single-select — one payer per expense, one receiver per settlement.
- **Decision**: Option B. The CSV's `paid_by` column holds exactly one name on every row (never the `;`-delimited list format used by `split_with`/`split_details`), and a settlement is inherently a one-payer-to-one-receiver transfer (e.g. "Rohan paid Aisha back"). Multi-payer is a real product feature, **but this dataset never exercises it, and the assignment says to "support every split type that appears in the CSV."** Splitting is multi-party (`split_with`); *paying* is not. Adding multi-payer support would mean a join table instead of the single `Expense.paidByUserId` FK and would complicate balance math for zero rows of actual benefit, so it was deliberately left out of scope.
