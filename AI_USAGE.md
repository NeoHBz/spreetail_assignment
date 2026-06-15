# AI_USAGE.md — AI Usage Log

This document lists the AI tools used, key prompts, and cases where the agent produced incorrect code that was corrected.

## AI Tools Used
- Gemini 3.5 Flash (Low) via Antigravity Agentic system.
- Claude Sonnet 4.6 via Claude Code
- Claude Opus 4.8 (1M context) via Claude Code

## Key Prompts & Tasks
- Initial repository analysis and anomaly cataloging.
- Schema setup for Postgres and Prisma adapter configurations.
- Pure functions for equal, percentage, unequal, and weight-based splitting.
- Importer parser validation for exit dates and overlapping duplicates.
- **Cross-import & recurring duplicate detection** (Opus 4.8): prompted with "file1.csv contains `entry 1`, already imported; then file2.csv also contains `entry 1` — should we detect this, and should rent/bills be smartly flagged?" The agent first surfaced that the existing dedup was intra-file only, proposed a three-tier plan (exact cross-import / recurring-period-aware / near-duplicate), then implemented it in `import.ts` + `ImportPanel.tsx`. See DECISIONS.md §9.

## Code Corrections & Fixes

1. **Prisma Driver Adapter configuration (Prisma 6+ adapter API)**:
   - *Issue*: The AI initially followed Prisma 5 docs and attempted to wire the PrismaPg adapter via `previewFeatures = ["driverAdapters"]` in `schema.prisma`, which is the pre-v6 approach.
   - *Fix*: The project uses Prisma 6+ where `previewFeatures` is not required. The correct approach is passing the adapter directly to the PrismaClient constructor: `new PrismaClient({ adapter: new PrismaPg(pool) })` in `packages/db/client.ts`. `prisma.config.ts` uses `defineConfig` for the datasource URL. `schema.prisma` has no `previewFeatures` entry and the app works correctly.

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

7. **Add Expense form allowed submission with invalid split sums**:
   - *Issue*: The "Add Expense" form displayed a running total warning (orange text) when percentage splits did not sum to 100% or unequal amounts did not match the total — but the form still submitted, causing a server error deep in the split calculation layer rather than surfacing a clear user-facing error.
   - *How caught*: Auditing the `handleCreateExpense` function found no guard before the API call; validation was purely visual, not enforced at submission.
   - *Fix*: Added pre-submit validation in `handleCreateExpense` that accumulates field-level errors, sets red border styling per invalid input, and returns early without calling the API. Submission is blocked until all sums are valid.

8. **Import session report endpoint exists but has no frontend wiring**:
   - *Note*: The backend exposes `GET /import/session/:id/report` which returns a downloadable JSON audit report with full anomaly + row summary for a session. This endpoint was generated by the AI but was never wired up in `ImportPanel.tsx`. It exists as a latent backend feature with no UI entry point.
