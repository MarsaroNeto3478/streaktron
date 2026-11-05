# Strekatron

A web app that builds consistency for studies and personal projects: real project management (areas, projects, goals, tasks, Kanban, calendar, countdowns, `@` links between anything) with light gamification (XP, levels, forgiving streaks, quests) and cosmetic rewards (loot boxes, collectibles, a customizable bedroom). Friend streaks come later.

**Status:** Phases 0–2 done: areas, projects with an active-project limit, goals, tasks and subtasks, Kanban boards, list view, inbox, command palette (Ctrl/⌘ K) and keyboard shortcuts (press `?`); rich-text descriptions where `@` or `[[` links any task, goal, project or area, with live-title chips, backlinks and full-text search. Next is Phase 3 (Today and the gamification core: the MVP).

## Docs

- [`plan.md`](plan.md): feature spec, gamification rules, architecture, data model, roadmap
- [`.claude/context/vision.md`](.claude/context/vision.md): the main idea and principles
- [`.claude/context/decisions.md`](.claude/context/decisions.md): every decision, with its reasons
- [`.claude/context/progress.md`](.claude/context/progress.md): status and session log

## Stack

TypeScript monorepo (pnpm): React + Vite, TanStack Router/Query, Tailwind + shadcn/ui, TipTap, dnd-kit, cmdk · Hono on Node · PostgreSQL + Drizzle · Better Auth · pg-boss · Vitest · Docker Compose. Later phases add PixiJS and Playwright.

```
apps/server      Hono API: Drizzle schema + migrations, Better Auth, pg-boss jobs
apps/web         React SPA (TanStack Router file routes in src/routes)
packages/shared  Zod schemas, prefixed ULIDs, day/time helpers (used by both)
```

## Development

Needs Node 24+ (`.nvmrc`), pnpm 11 and Docker.

```sh
corepack enable pnpm            # or: npm i -g pnpm@11
pnpm install
cp .env.example .env            # then set BETTER_AUTH_SECRET: openssl rand -base64 32
pnpm db:up                      # Postgres in Docker (port 5432 on localhost)
pnpm db:seed                    # optional: the dev account dev@strekatron.local / strekatron-dev
pnpm dev                        # server on :3001, web on http://localhost:5173
```

Without the seed, the first visit shows **first-run setup**, which creates the owner account. Sign-up is closed after that.

| Script | What it does |
|---|---|
| `pnpm dev` | Server (tsx watch) and Vite together; Vite proxies `/api` to the server |
| `pnpm test` | All Vitest projects. Server tests use a throwaway `strekatron_test` database, so Postgres must be running |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | TypeScript, ESLint, Prettier |
| `pnpm build` | Web app to `apps/web/dist`, server bundle to `apps/server/dist` |
| `pnpm db:generate` | New migration from schema changes (`apps/server/src/db/schema`) |
| `pnpm db:migrate` | Apply migrations. The server also does this on every start |

## Running it day to day, over Tailscale

The `app` service in `docker-compose.yml` is the whole app in one container: the API plus the built web app, on `127.0.0.1:3001`. `tailscale serve` gives it HTTPS on your tailnet, so your phone can use it (and later install it as a PWA).

1. Find your machine's tailnet name: `tailscale status --self` (or the admin console), e.g. `my-laptop.tail1234.ts.net`.
2. Add that origin to `.env`, next to the local ones:
   ```sh
   APP_ORIGINS=http://localhost:3001,https://my-laptop.tail1234.ts.net
   ```
3. Start the app, then serve it:
   ```sh
   docker compose up -d --build
   tailscale serve --bg 3001
   ```
4. Open `https://my-laptop.tail1234.ts.net` on any device on the tailnet.

If something else is already served at the root of your tailnet address, give Strekatron its own HTTPS port instead of replacing it: `tailscale serve --bg --https=8443 http://127.0.0.1:3001`, with `https://my-laptop.tail1234.ts.net:8443` in `APP_ORIGINS`. Tailscale serves HTTPS on 443, 8443 and 10000.

`tailscale serve status` shows what is served, and `tailscale serve --https=443 off` (or `--https=8443 off`) stops it. The first time, Tailscale may ask you to enable HTTPS certificates for the tailnet in the admin console. Stop `pnpm dev` before starting the container, since both use port 3001, or set `APP_PORT` in `.env` and serve that port instead.

## Backups

A pg-boss job checks every hour and writes one `pg_dump` per day (named by the owner's local day) to `data/backups/strekatron-YYYY-MM-DD.dump`, keeping the newest 14. Because the check is hourly, a laptop that was off at night still gets its backup. To trigger one now, send `POST /api/admin/backup` while signed in.

Restore a backup with `pg_restore --clean --if-exists -d <database-url> data/backups/strekatron-YYYY-MM-DD.dump`. Without a host `pg_dump`, `pnpm dev` uses the one in the database container (`PG_DUMP` in `.env`); the app image ships its own.
