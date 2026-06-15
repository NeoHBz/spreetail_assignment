# SCOPE.md — Anomaly Log & Database Schema

This document details the CSV importer anomaly detection catalog and the database schema design.

## Anomaly Catalog & Resolutions

The importer parses `csv_inputs/expenses_export.csv` and detects 25 distinct data anomaly types. Row numbers below refer to **file lines** (header = Row 1; first data row = Row 2).

### Surfaced to User (Pending Review)

1. **Exact Duplicate** (Rows 5 & 6, Marina Bites): Flagged; requires user review to reject/delete the duplicate row.
2. **Conflicting Duplicate** (Rows 24 & 25, Thalassa): Flagged; shows both sides, requires user choice on which amount is correct.
3. **Settlement Logged as Expense** (Row 14, Rohan pays Aisha): Detected by keywords and single recipient; user confirms routing to `settlements` instead of `expenses`.
4. **Negative Amount** (Row 26, Parasailing refund): Extrapolated as refund. Supported as negative split.
5. **Zero Amount** (Row 31): Flagged; user must confirm or skip.
6. **Unknown Payer** (Row 11, Priya S): Flagged; user must manually map/correct.
7. **Missing Payer** (Row 13): Flagged; blocks import until user attributes.
8. **Non-member in Split** (Row 23, Kabir): Created as `Guest` record, attributed share.
9. **Post-exit Member in Split** (Row 36, Meera in April): Remove Meera from split, recalculate other active members' shares. User can override and keep member in split via `keepInSplit` flag.
10. **Pre-join Member in Split**: Removed from split. User can override and keep member in split via `keepInSplit` flag.
11. **Percentage Sum != 100%** (Row 15): Blocks import until user edits percentages or uses auto-equalize.
12. **Ambiguous Date** (Row 34, 04/05/2026): Surfaces choices (April 5th vs May 4th) for user mapping.
13. **Type/Detail Mismatch** (Row 42): splitType `equal` overrides split_details; logged warning, user confirms.
14. **Visitor Payer** (Dev, Goa Villa, Row 20): Non-member user fronted money; allowed but surfaced so group acknowledges the external credit. See also `non_member_payer` below.
15. **Inactive Member Payer** (`inactive_member_payer`): A group member who was inactive (outside their membership window) on the expense date paid the bill; flagged for user confirmation.
16. **Non-Member Recognized Payer** (`non_member_payer`): A known user who has no group membership paid an expense; offers an "Add as Member" resolution path. Distinct from `visitor_payer` (Dev), which is hardcoded as an allowed external credit.
17. **Cross-Import Duplicate** (`cross_import_duplicate`): Exact match against an already-committed expense; default action Skip. See DECISIONS.md §9.
18. **Recurring Period Duplicate** (`recurring_period_duplicate`): Same recurring series (rent, bills, etc.) already has an entry for this month. Default action Skip. See DECISIONS.md §9.
19. **Possible Double Entry** (`possible_double_entry`): Non-recurring row matches a committed expense within 3 days by same description + payer + amount. Default action Skip. See DECISIONS.md §9.
20. **Invalid Date** (`invalid_date`): Date field is completely unparseable; row blocked until corrected.

### Auto-Fixed (No User Action Required)

21. **Malformed Amount** (Row 7, ₹1,200): Comma separators normalized and parsed.
22. **Sub-paisa Precision** (Row 10, 899.995): Rounded to 2 decimal places.
23. **Missing Currency** (Row 28): Default set to INR; warning logged.
24. **Whitespace in Payer Name** (Row 27) / **Whitespace in Amount** (Row 29): Leading/trailing whitespace trimmed.
25. **Payer Name Case Inconsistency** (`case_inconsistency_payer`): Payer name casing normalized to canonical form from the users table (e.g. `rohan` → `Rohan`). Treated as non-ambiguous since the canonical form is always deterministic. Also catches missing-year dates (e.g. "Mar 14" → "Mar 14, 2026") on the same normalization pass.
26. **Inconsistent Date Format**: Multiple date formats (DD/MM/YYYY, MM/DD/YYYY, natural language) parsed dynamically via multi-strategy parser.

## Database Schema (ERD Description)

Our relational PostgreSQL schema defines:

- `User`: Canonical users with credentials.
- `Guest`: One-off split members (e.g. Kabir) added by a user.
- `Group`: Flat expense groups.
- `GroupMembership`: Tracks `joinedAt` and nullable `leftAt` to define membership windows.
- `Expense`: Tracks original amounts, original currencies, and converted INR amounts.
- `ExpenseSplit`: Tracks ratios and converted INR shares. A CHECK constraint enforces that exactly one of `userId` / `guestId` is non-null per split row.
- `Settlement`: Relates direct peer payment settlements.
- `ExchangeRate`: Historical rates seeded (e.g. USD -> INR = 83.00).
- `ImportSession`, `ImportRow`, `ImportAnomaly`: Staged ingestion blocks.

## Balance Engine

The balance API (`GET /balances/group/:groupId`) computes net balances across all members and non-member payers:

- **Point-in-time filtering**: Optional `?asOfDate=YYYY-MM-DD` query param restricts the calculation to expenses and settlements on or before the given date. Date strings are normalized to end-of-day UTC (`23:59:59.999`) so a date-only string includes the full day.
- **Non-member payer inclusion**: After building the members map from `GroupMembership`, the engine iterates expenses and inserts any payer not already in the map (e.g. Dev) with an initial balance of 0, ensuring external credits are not silently dropped.
- **Debt minimization**: A greedy `minimizeDebts` algorithm (O(n log n), creditor/debtor heap matching) reduces the raw pairwise balance matrix to the minimum number of settlement transactions needed to zero all balances. These appear in the UI as suggested settlements.
- **Per-user drilldown**: `GET /balances/group/:groupId/user/:userId` provides a full breakdown per user: expenses paid, splits owed, settlements sent, and settlements received.
