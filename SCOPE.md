# SCOPE.md — Anomaly Log & Database Schema

This document details the CSV importer anomaly detection catalog and the database schema design.

## Anomaly Catalog & Resolutions

The importer parses `csv_inputs/expenses_export.csv` and checks for 20 distinct data anomalies. Here is how they are processed:

1. **Exact Duplicate** (Rows 5 & 6, Marina Bites): Flagged; requires user review to reject/delete the duplicate row.
2. **Conflicting Duplicate** (Rows 24 & 25, Thalassa): Flagged; shows both sides, requires user choice on which amount is correct.
3. **Settlement Logged as Expense** (Row 14, Rohan pays Aisha): Detected by keywords and single recipient; user confirms routing to `settlements` instead of `expenses`.
4. **Negative Amount** (Row 26, Parasailing refund): Extrapolated as refund. Supported as negative split.
5. **Zero Amount** (Row 31): Flagged; user must confirm or skip.
6. **Malformed Amount** (Row 7, ₹1,200): Comma separators are normalized and parsed.
7. **Sub-paisa Precision** (Row 10, 899.995): Rounded to 2 decimal places.
8. **Unknown Payer** (Row 11, Priya S): Flagged; user must manually map/correct.
9. **Missing Payer** (Row 13): Flagged; blocks import until user attributes.
10. **Missing Currency** (Row 28): Warnings logged, default set to INR.
11. **Non-member in Split** (Row 23, Kabir): Created as `Guest` record, attributed share.
12. **Post-exit Member in Split** (Row 36, Meera in April): Remove Meera from split, recalculate other active members' shares.
13. **Pre-join Member in Split**: Removed from split.
14. **Percentage Sum != 100%** (Row 15): Blocks import until user edits percentages.
15. **Ambiguous Date** (Row 34, 04/05/2026): Surfaces choices (April 5th vs May 4th) for user mapping.
16. **Inconsistent Date Format**: Formats parsed dynamically.
17. **Type/Detail Mismatch** (Row 42): splitType equal overrides details, logged warning.
18. **Whitespace in Payer Name** (Row 27): Trimmed.
19. **Whitespace in Amount** (Row 29): Trimmed.
20. **Visitor Payer** (Dev Goa Villa): Allowed visitor payment without flat group membership.

## Database Schema (ERD Description)

Our relational PostgreSQL schema defines:

- `User`: Canonical users with credentials.
- `Guest`: One-off split members (e.g. Kabir) added by a user.
- `Group`: Flat expense groups.
- `GroupMembership`: Tracks `joinedAt` and nullable `leftAt` to define membership windows.
- `Expense`: Tracks original amounts, original currencies, and converted INR amounts.
- `ExpenseSplit`: Tracks ratios and converted INR shares.
- `Settlement`: Relates direct peer payment settlements.
- `ExchangeRate`: Historical rates seeded (e.g. USD -> INR = 83.00).
- `ImportSession`, `ImportRow`, `ImportAnomaly`: Staged ingestion blocks.
