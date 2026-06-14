# FlatBalance — Shared Expenses App

An application to track and resolve shared flat expenses, ingest spreadsheets containing anomalies, and compute minimal settlement debt paths.

## Tech Stack
- **Backend**: Bun + Express + Prisma + PostgreSQL
- **Frontend**: React + Vite (Vanilla CSS dark theme)
- **Monorepo Manager**: Bun Workspaces

## Setup & Running

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Configure Database**:
   Start the dockerized PostgreSQL container:
   ```bash
   cd docker/postgres
   docker compose up -d
   cd ../..
   ```

3. **Prisma Migrations & Seeds**:
   ```bash
   cd packages/db
   DATABASE_URL="postgresql://postgres:password@localhost:5432/spreetail?schema=public" bun db:migrate --name init
   DATABASE_URL="postgresql://postgres:password@localhost:5432/spreetail?schema=public" bun prisma/seed.ts
   cd ../..
   ```

4. **Run Dev Servers**:
   ```bash
   bun dev
   ```
   API runs on `http://localhost:3001` and Web runs on `http://localhost:5173`.
