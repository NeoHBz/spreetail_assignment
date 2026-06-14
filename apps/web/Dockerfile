# syntax=docker/dockerfile:1
# Build context is the repo root (see compose.yaml) so workspace packages resolve.
FROM oven/bun:1.3.14-slim AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM deps AS build
# VITE_ vars are inlined into the bundle at build time (public, no secrets).
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
COPY . .
RUN cd apps/web && bun run build

# Serve the static SPA via nginx.
FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
