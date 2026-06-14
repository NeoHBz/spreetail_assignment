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
