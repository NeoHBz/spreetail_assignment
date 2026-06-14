# AGENTS.md

Behavioral guidelines for this project.

---

## CRITICAL RULE: NO EMOJIS ANYWHERE

Do NOT use emojis in code, UI text, labels, comments, docstrings, commit messages, documentation, or chat responses.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

---

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

---

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

---

## 4. Tooling

- **Package manager**: `bun` (never npm/yarn)
- **JSON queries**: use `jq` in shell scripts, not manual parsing
- **YAML queries**: use `yq` where applicable
- **ORM**: Prisma (schema-first, type-safe)
- **Build**: `bun run build`
- **Dev server**: `bun run dev`
- Use `bunx` instead of `npx`

---

## 5. Code Quality

- Follow **SOLID**, **DRY**, and **KISS** principles.
- Write readable, self-documenting code with meaningful names and small functions.
- Implement robust error handling. Use low-cardinality log messages:
  - `logger.info({ id, foo }, 'Message')`, `logger.error({ error }, 'Message')`
- No non-null assertions (`!`) unless you have external proof TypeScript cannot infer.
- No TypeScript `any` — fix the root type instead.
- At the end of every task: ensure zero lint errors and zero type errors in edited files.

---

## 6. Commit Strategy

Commit at each meaningful phase — never a single bulk commit.

Format: `type: short description`
Examples:
- `feat: add membership time-range validation to split calculator`
- `fix: normalize trailing whitespace in CSV payer names`
- `chore: add migration for exchange_rates table`

Update plan.md after each prompt finish.
---

**These guidelines are working if:** diffs are minimal, questions come before mistakes, and every line in the repo can be explained.
