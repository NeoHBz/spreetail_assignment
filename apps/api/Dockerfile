# syntax=docker/dockerfile:1
# Build context is the repo root (see compose.yaml) so workspace packages resolve.
# Debian-based image (not alpine) so bcrypt's glibc prebuilds install cleanly.
FROM oven/bun:1.3.14-slim AS deps
WORKDIR /app

# Install with only manifests + lockfile first for better layer caching.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
# Generate the Prisma client. A dummy URL satisfies config loading; generate
# does not connect to the database.
RUN cd packages/db && \
    DATABASE_URL="postgresql://user:pass@localhost:5432/db" bunx prisma generate

FROM build AS runtime
ENV NODE_ENV=production
EXPOSE 3001
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "apps/api/src/server.ts"]
