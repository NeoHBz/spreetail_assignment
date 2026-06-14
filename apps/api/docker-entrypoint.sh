#!/bin/sh
set -e

# Apply pending migrations against the running database before booting the API.
echo "Applying database migrations..."
( cd /app/packages/db && bunx prisma migrate deploy )

# Optionally seed (idempotency depends on prisma/seed.ts): RUN_SEED=true
if [ "$RUN_SEED" = "true" ]; then
  echo "Seeding database..."
  ( cd /app/packages/db && bun prisma/seed.ts ) || echo "Seed step failed (continuing)."
fi

exec "$@"
