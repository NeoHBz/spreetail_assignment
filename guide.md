Good, I have the full picture. Now let me catalog all the anomalies systematically before giving you the plan.Now I have a complete picture. Here's the full analysis and how to approach this.

---

## CSV Anomaly Catalog (all 12+)

| # | Row | Problem | Type |
|---|-----|---------|------|
| 1 | 3+4 | "Dinner at Marina Bites" and "dinner - marina bites" — same date, same amount, same payer | **Duplicate** |
| 2 | 5 | Amount `1,200` (comma as thousands separator) — won't parse as float | **Malformed amount** |
| 3 | 7 | `paid_by = priya` (lowercase) vs canonical `Priya` | **Case inconsistency** |
| 4 | 8 | Amount `899.995` — sub-paisa precision, ambiguous rounding | **Precision anomaly** |
| 5 | 9 | `paid_by = Priya S` — not a known member name | **Unknown payer** |
| 6 | 11 | `paid_by = NaN` — no payer recorded | **Missing payer** |
| 7 | 12 | "Rohan paid Aisha back" — `split_type = NaN`, notes say "settlement not an expense" | **Settlement logged as expense** |
| 8 | 13,30 | Percentage splits sum to 110% (30+30+30+20) | **Invalid percentage split** |
| 9 | 14+ | Date format switches from `YYYY-MM-DD` → `DD/MM/YYYY` → `Mar 14` → back | **Inconsistent date formats** |
| 10 | 21 | `split_with` includes "Dev's friend Kabir" — not a flat member, no account | **Non-member in split** |
| 11 | 22+23 | "Dinner at Thalassa" (Aisha, ₹2400) and "Thalassa dinner" (Rohan, ₹2450) — same event, different amounts | **Conflicting duplicate** |
| 12 | 24 | `amount = -30 USD` — negative amount (refund context is clear from notes) | **Negative amount** |
| 13 | 25 | `paid_by = rohan ` (trailing space) | **Whitespace/case issue** |
| 14 | 26 | `currency = NaN` — missing currency | **Missing currency** |
| 15 | 27 | `amount = " 1450 "` (leading+trailing spaces) | **Whitespace in amount** |
| 16 | 29 | `amount = 0` — zero amount expense | **Zero amount** |
| 17 | 32 | Date `04/05/2026` — ambiguous: April 5 or May 4? (DD/MM vs MM/DD) | **Date ambiguity** |
| 18 | 34 | Groceries April with `split_with` including Meera, who moved out March 31 | **Post-exit member in split** |
| 19 | 36 | "Sam deposit share" — a deposit/settlement, not a shared expense | **Settlement logged as expense** |
| 20 | 40 | `split_type = equal` but `split_details` has share weights — contradiction | **Type/detail mismatch** |

That's 20. The prompt says "at least 12" — you have them covered.

---

## How to Approach the Build

### 1. Schema Design (do this first, everything depends on it)

Core entities:
- `users` — canonical member list
- `groups` — the flat itself
- `group_memberships` — `(user_id, group_id, joined_at, left_at)` — this is what makes Sam's question answerable
- `expenses` — one row per expense, with `paid_by`, `amount`, `currency`, `date`, `split_type`
- `expense_splits` — one row per person per expense, with computed `owed_amount`
- `settlements` — separate table, not mixed into expenses
- `exchange_rates` — store the USD→INR rate used at import time (document it)
- `import_anomalies` — every flagged row, the reason, the action taken, pending user approval

The membership table with `joined_at`/`left_at` is the architectural answer to Sam's and Meera's concerns.

### 2. Import Pipeline Logic

Write it as a multi-stage pipeline, not a single bulk insert:

```
Parse → Normalize → Detect anomalies → Stage for review → User approves → Commit
```

Staged import means Meera's "approve before deleting" requirement is built into the flow, not bolted on.

**Decisions you must document per anomaly:**

| Anomaly | Suggested Policy |
|---------|-----------------|
| Duplicate (exact) | Flag both, auto-suggest deleting one, require user confirmation |
| Conflicting duplicate (Thalassa) | Flag both, surface the discrepancy, user picks which row wins |
| Settlement as expense | Detect by: no split_type, description keywords, zero split_with — route to settlements table |
| Negative amount | Treat as refund if context supports it (check notes), create negative split |
| Percentage != 100% | Block import for this row, require manual fix — never silently normalize |
| Missing currency | Flag; default to INR with warning since all other domestic expenses are INR |
| Missing payer | Block row, require resolution before import |
| Post-exit member | Compute from `left_at`; warn and remove them from split, recalculate shares |
| Non-member in split | Flag "Kabir" as guest; either create a guest record or exclude from tracked balances |
| Type/detail mismatch (row 40) | `split_type` wins over `split_details` for equal; ignore details, log warning |
| Sub-paisa precision | Round to 2 decimal places, log rounding |
| USD expense | Convert at a documented fixed rate (check a reputable source for Mar 2026 rate, store it) |

### 3. Balance Calculation

For Rohan's requirement (traceability), every balance must link back to individual `expense_splits` rows. Your balance endpoint should return not just a number but the list of expense IDs that compose it.

For Aisha's requirement (one number), compute the minimal settlement graph on top — this is the classic "minimize transactions" algorithm on the net balance vector.

### 4. Tech Stack Recommendation

Given your existing stack:
- **Backend**: Bun + Express + PostgreSQL (via Drizzle ORM — schema-first, plays well with your TS patterns)
- **Frontend**: React (can reuse patterns from AuthScale dashboard)
- **Auth**: Simple session-based or JWT — doesn't need to be Authentik-level for this
- **Deploy**: Railway or Render (free tier, Postgres included, deployable in under 30 min)

Don't spend days on infra. The evaluation is on data handling and decision-making, not DevOps.

### 5. Commit Strategy

The evaluators explicitly flag single-bulk commits as a red flag. Structure your work in phases and commit at each:

1. Schema + migrations
2. Auth module
3. Group/membership CRUD
4. Expense + split CRUD
5. Import parser (anomaly detection)
6. Import review UI
7. Balance calculation
8. Settlement recording
9. Frontend views
10. Deploy

Each commit message should be a verb + what changed, e.g. `feat: add membership time-range validation to split calculator`.

### 6. Documents to Write (SCOPE, DECISIONS, AI_USAGE)

Write these as you build, not after. The evaluators will ask you to trace decisions to code lines. If you write them after, they won't match.

**DECISIONS.md must cover at minimum:**
- Why settlements are a separate table from expenses
- How you handle percentage splits that don't sum to 100%
- The USD conversion rate chosen and why (fixed vs. live)
- What "membership window" means in your system and how it affects split calculation
- How you resolve the conflicting Thalassa duplicate

---

## What to Do Right Now

1. Set up the repo with a proper folder structure
2. Write the DB schema (ERD first, then migrations)
3. Write the anomaly list in SCOPE.md while this analysis is fresh
4. Build the import parser in isolation (pure function, takes CSV rows, returns annotated anomaly objects) — this is the hardest and most evaluated part, so do it before the UI

The import pipeline is the heart of the evaluation. Get that right first.
