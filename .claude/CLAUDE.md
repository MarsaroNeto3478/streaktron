# Streaktron — project memory

Streaktron is a web app that helps people stay consistent with studies and personal projects. It combines real project management (areas → projects → goals → tasks, Kanban, list, calendar, countdowns, `@` mentions with backlinks) with light gamification (XP, levels, forgiving streaks, typed quests) and a cosmetic reward layer (loot boxes, collectibles, a customizable bedroom with a wardrobe of medals). Friend streaks come later. The first user is the author (a CS student), but it is **designed to potentially become a product**.

## Current status

- **Phase:** Phases 0–2 done 2026-11-03; **Phase 3 (Today + gamification core = MVP) built 2026-11-04 on branch `phase-3-mvp`**; next: dogfooding, then Phase 4.
- **Run it:** `pnpm db:up && pnpm dev` (README has setup, scripts, Tailscale and backups). On the Windows machine pnpm isn't installed globally: use `npx pnpm@11.24.0 …`.
- **Repository:** https://github.com/MarsaroNeto3478/streaktron (this user's copy), branch `main`.
- **Two parallel Streaktrons:** the user and a partner (`JVGdev/streaktron`) built a shared base, then each continues their own version; at the end they'll compare both and merge the best into a bigger project. Keep this repo's choices well documented (decisions.md) so the comparison is easy; never push to the partner's repo.
- Detailed status and session history: `.claude/context/progress.md`.

## Where things live

| File | What it holds | Owner of |
|---|---|---|
| `plan.md` | Feature spec, gamification rules, architecture and stack, data model, API sketch, phases with checkboxes, lessons from Quire, backlog, open questions | **what to build and how** |
| `.claude/context/vision.md` | Main idea, the problem, target user, principles, product direction | **why** |
| `.claude/context/decisions.md` | Every decision (D1…), with rationale, alternatives, status; rejected ideas | **decisions** (canonical log) |
| `.claude/context/progress.md` | Session log, what's done, what's next | **state** |
| `observations.txt` | The user's idea inbox between sessions (they clear it after merging) | — |

Read the relevant context file before working on an area; read `plan.md` sections as needed rather than all of it.

## Load-bearing decisions (one-liners; details in decisions.md)

- **Stack (D14):** TypeScript pnpm monorepo — React + Vite, TanStack Router/Query, Tailwind + shadcn/ui, TipTap, dnd-kit, PixiJS · Hono on Node · PostgreSQL + Drizzle · Better Auth · pg-boss · Vitest + Playwright · Docker Compose.
- **Runs locally and over Tailscale** (`tailscale serve` HTTPS) for now (D2); single user, multi-tenant data model (D1).
- **Gamification is derived from an append-only activity log** (D8) and is **server-authoritative** (D17).
- **XP is never taken away; each source earns once** (D15).
- **Every completed quest grants a loot box**, rolled server-side; **no real-money purchases, ever** (D11).
- **Make quests come with a follow-up quest and a soft cap** (D16).
- **Hard active-project limit**, default 3 (D5). **Mentions are free-form only**, no behavioral effect (D4). **English UI** (D7).

## Working agreements

- **Ask clarifying questions** when a decision is genuinely the user's; give a recommendation, not a survey.
- **Record every new or changed decision** in `.claude/context/decisions.md` (new ID, date, rationale). Never silently diverge from it.
- **Don't re-propose rejected ideas** (listed at the end of decisions.md).
- **When `observations.txt` has new content**, fold it into `plan.md` (right phase/section) and decisions.md if it decides something, then tell the user.
- **Tick `plan.md` checkboxes** as tasks finish and **append a session entry to `progress.md`** at the end of meaningful work.
- New ideas go to `plan.md` §12 (backlog), not into the current phase.
- **Quire** (`~/Documentos/quire`) is the user's earlier personal app (Svelte 5 + Fastify + node:sqlite). It is a **reference only**: reuse its framework-agnostic logic and lessons (plan.md §11), never integrate with it.

## Code conventions

- IDs: type-prefixed ULIDs (`tsk_`, `prj_`, `gol_`, `are_`, `hab_`, `evt_`…).
- References are FK columns with explicit `ON DELETE`; `jsonb` only for leaf data.
- Day arithmetic only on `YYYY-MM-DD` values; the user's day comes from their stored timezone + day-start hour.
- Game rules are pure functions in `packages/shared/game`, exhaustively unit-tested; the server is the only place they run for real.
- Write responses carry a `game` block with the events they caused.
- One client autosave helper (`useAutosave`) and one optimistic-update merge rule (`lib/task-cache.ts`); writes go through `lib/actions.ts`.
- Game evaluation errors never fail a committed write (log and retry).
- Failed API responses are always `{ error: { code, message, details? } }` (throw `HttpError` on the server); the web app calls the API only through `call()` in `apps/web/src/lib/api.ts`.
- Schema changes: edit `apps/server/src/db/schema`, then `pnpm db:generate`. Hand-written SQL goes in a `drizzle-kit generate --custom` migration, never into generated ones.
- TypeScript stays on 6.0 until typescript-eslint supports TS 7 (it needs the old JS API).
- Pure structure rules (board, next action, transitions) live in `packages/shared/structure`; rich text is TipTap JSON + `*_text` (`packages/shared/rich`).
- Rich text is edited only through `RichEditor`; every description write calls `writeLinks` in the same transaction. Sheets start their editors from freshly fetched data only.
- Every service lookup is scoped by `user_id`; another account's ids answer 404.
- Commit or push only when the user asks.
