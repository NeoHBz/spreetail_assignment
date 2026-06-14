# AI_USAGE.md — AI Usage Log

This document lists the AI tools used, key prompts, and cases where the agent produced incorrect code that was corrected.

## AI Tools Used
- Gemini 3.5 Flash (Low) via Antigravity Agentic system.

## Key Prompts & Tasks
- Initial repository analysis and anomaly cataloging.
- Schema setup for Postgres and Prisma adapter configurations.
- Pure functions for equal, percentage, unequal, and weight-based splitting.
- Importer parser validation for exit dates and overlapping duplicates.

## Code Corrections & Fixes

1. **Prisma Driver Adapter configuration missing in previewFeatures**:
   - *Issue*: The AI generated a custom pg pool config in `prisma.config.ts` using the new PrismaPg adapter but forgot to enable the `driverAdapters` preview feature in `schema.prisma`.
   - *Fix*: Caught by typecheck builds; added `previewFeatures = ["driverAdapters"]` in generator client schema.

2. **Express Router Type Inference**:
   - *Issue*: In Express backend routers, declaring `const router = Router()` without annotations threw compilation typecheck errors during bundle builds due to missing implicit core typing exports.
   - *Fix*: Explicitly annotated routers as `const router: Router = Router()`.

3. **Missing rawRow property on exact duplicates**:
   - *Issue*: Exact duplicate checks in the CSV parser did not include the `rawRow` payload parameter during creation, breaking DB type constraints.
   - *Fix*: Added the parameter payload in `import.ts`.

4. **Conflicting duplicate detection hardcoded to "thalassa"**:
   - *Issue*: The AI implemented the conflicting duplicate check using a hardcoded `includes("thalassa")` string match on both rows. This was a development artifact from the specific CSV test case. Any other conflicting duplicate in the file (or future imports) would be silently missed.
   - *How caught*: Audit review of the detection logic compared against the general definition stated in plan.md — "same description + date but different amount or paid_by".
   - *Fix*: Replaced with a general rule comparing description (case-insensitive, trimmed), date, amount, and payer for all row pairs.

5. **Non-member payer (Dev) silently excluded from balance calculations**:
   - *Issue*: The balance engine built its members map exclusively from `group_memberships`. Dev has a `users` row but no membership. So when Dev's paid expenses were processed, `membersMap[e.paidByUserId]` was `undefined` and his credit was silently dropped — the group's net balances were wrong.
   - *How caught*: Audit review of the balance computation loop compared against the schema design note that "only users can be paid_by" and Dev is a user.
   - *Fix*: After building the base membersMap, the code now iterates expenses and inserts any payer not already in the map, ensuring all non-member payers appear in balance output.

6. **Percentage auto-equalize button sent empty object, crashing commit transaction**:
   - *Issue*: The "Auto-Equalize Percentages" button in ImportPanel passed `percentages: {}` to the anomaly resolution. The commit handler read this as "no overrides" and fell through to the raw `split_details` which still summed to 110%. This caused `splitPercentage()` to throw, rolling back the entire commit transaction.
   - *How caught*: Tracing the data flow from the button click through `handleResolveAnomaly` → PATCH anomaly endpoint → commit loop → `splitPercentage()`.
   - *Fix*: Backend commit now detects an empty `percentages` object as the auto-equalize signal. It computes equal percentage shares across all split members (with rounding remainder on first member) before calling `splitPercentage()`.
