# FlatBalance — Shared Expenses App

An application to track and resolve shared flat expenses, ingest CSV spreadsheets containing anomalies, and compute minimal-transaction debt settlement paths.

## Features

- **CSV Import Pipeline** — multi-stage parse → normalize → detect → review → commit flow, handling 20 distinct data anomalies (duplicates, missing fields, non-members, post-exit splits, ambiguous dates, and more)
- **Split Types** — equal, percentage, unequal amount, and weight-based splits
- **Membership Windows** — `joinedAt` / `leftAt` per member so expenses only affect people who were active on that date
- **Minimal Settlement Graph** — computes the fewest peer-to-peer transfers to clear all net balances
- **Guest Support** — one-off visitors get a lightweight Guest record; no credentials required
- **Cross-Import Duplicate Detection** — three-tier (exact / recurring-period-aware / near-duplicate) dedup across historical imports
- **Dark Theme UI** — React + Tailwind + shadcn/ui

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Backend | Express + Prisma + PostgreSQL 15 |
| Frontend | React 18 + Vite + Tailwind CSS v4 + shadcn/ui |
| Monorepo | Bun Workspaces |
| Auth | JWT + bcrypt |
| Containerisation | Docker Compose |

## Repository Layout

```
apps/
  api/          Express API (src/server.ts)
  web/          React SPA (Vite)
packages/
  db/           Prisma schema + client + migrations
  shared/       Types shared between api and web
docker/
  postgres/     Standalone Postgres compose for local dev
csv_inputs/     Sample CSVs used for import testing
```

## Prerequisites

- **Bun** ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)
- **Docker** (for the Postgres container)

---

## Option A — Local Dev (recommended for development)

### 1. Clone & install dependencies

```bash
git clone https://github.com/NeoHBz/spreetail_assignment
cd spreetail_assignment
bun install
```

### 2. Start Postgres

```bash
cd docker/postgres
docker compose up -d
cd ../..
```

This starts `postgres:15-alpine` on `localhost:5432` with the credentials in `.env`.

### 3. Run migrations and seed

```bash
cd packages/db
DATABASE_URL="postgresql://postgres:password@localhost:5432/spreetail?schema=public" bun db:migrate --name init
DATABASE_URL="postgresql://postgres:password@localhost:5432/spreetail?schema=public" bun prisma/seed.ts
cd ../..
```

### 4. Start dev servers

```bash
bun dev
```

- **API** → `http://localhost:3001`
- **Web** → `http://localhost:5173`

The API reads `.env` at the repo root. The web app reads `apps/web/.env` (copy from `.env.example`).

```bash
cp apps/web/.env.example apps/web/.env
```

---

## Option B — Docker Compose (full-stack containers)

Copy and edit the env file, then bring everything up:

```bash
cp .env.example .env
docker compose up --build
```

Services:

| Container | Port | Description |
|---|---|---|
| `spreetail_postgres` | 5432 | PostgreSQL database |
| `spreetail_api` | 3001 (configurable via `API_PORT`) | Express API |
| `spreetail_web` | 5173 → 80 | React SPA served by nginx |

The API container runs `prisma migrate deploy` automatically on startup via `docker-entrypoint.sh`.

---

## Environment Variables

### Root `.env` (API + Compose)

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `postgres` | DB username |
| `POSTGRES_PASSWORD` | `password` | DB password |
| `POSTGRES_DB` | `spreetail` | Database name |
| `JWT_SECRET` | `supersecretkey` | JWT signing secret — **change in production** |
| `API_PORT` | `3001` | Port the API listens on |
| `DATABASE_URL` | *(assembled from above)* | Full Prisma connection string |

### `apps/web/.env`

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3001` | API root URL baked into the client bundle at build time |

---

## Database Migrations

```bash
# Create a new migration
cd packages/db
bun db:migrate --name <migration-name>

# Apply pending migrations (prod/CI)
bun prisma migrate deploy

# Open Prisma Studio
bun prisma studio
```

---

## AI Tools Used

This project was built with AI assistance. The full log of tools, key prompts, and code corrections is in [`AI_USAGE.md`](./AI_USAGE.md). Summary:

| Tool | Role |
|---|---|
| **Claude Sonnet 4.6** (via Claude Code) | Primary implementation driver — schema design, API routes, import pipeline, frontend components, anomaly detection logic |
| **Claude Opus 4.8** (1 M context, via Claude Code) | Cross-import & recurring duplicate detection design and implementation (DECISIONS.md §9) |
| **Gemini 3.5 Flash** (via Antigravity agentic system) | Initial repository analysis and anomaly cataloging |

Key instances where AI output was corrected before committing are documented in `AI_USAGE.md` — including a hardcoded `"thalassa"` string in a general duplicate-detection rule, a silent balance exclusion for non-member payers, and a form submission path that bypassed split-sum validation.

---

## Key Design Decisions

Full rationale is in [`DECISIONS.md`](./DECISIONS.md). Highlights:

- **Settlements are a separate table** from expenses — they are peer-to-peer transfers with no split logic.
- **Membership windows** (`joinedAt` / `leftAt`) determine whether a member owes a share of any given expense date.
- **USD conversion** uses a seeded historical rate (83.00 INR/USD for March 2026) rather than a live API, ensuring import consistency.
- **Duplicate detection** operates at three tiers: exact cross-import match, recurring-period-aware match, and near-duplicate — surfaced as resolvable anomalies rather than hard DB constraints.
- **Non-member payers** (e.g. Dev) are dynamically inserted into the balance map so their credits are not silently dropped.

## Anomaly Catalog

The importer handles 20 distinct CSV anomalies. The full catalog with per-row references is in [`SCOPE.md`](./SCOPE.md).
