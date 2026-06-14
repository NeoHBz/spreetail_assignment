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
