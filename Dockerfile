# The whole app in one image: the Hono server serving the API and the built web app.
# Built and run by docker-compose.yml (`docker compose up -d --build`).

FROM node:26-trixie-slim AS base
# Node 25+ no longer bundles corepack; install the pnpm version package.json pins.
RUN npm install -g pnpm@11.24.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter @strekatron/server

FROM node:26-trixie-slim
# pg_dump for the nightly backups; Debian trixie's client matches the Postgres 17 server.
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
CMD ["node", "--enable-source-maps", "apps/server/dist/index.js"]
