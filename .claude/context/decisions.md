# Decisions log

The canonical record of what was decided, why, and what was considered instead. `plan.md` refers to these IDs (D1…).

**Rules:** add new decisions with the next ID and a date; when one changes, mark the old one *superseded* (keep it) and link the new one. Status is one of: **accepted**, **revised**, **superseded**, **deferred**, **pending confirmation**.

---

### D1 · Single user now, friends later — accepted (2026-11-03)
- **Decision:** One user (the author) at first; social features later. Every table has `user_id` from day one.
- **Why:** The author is the first user; friends are a known future goal, and scoping data per user from the start avoids a rewrite.

### D2 · Runs locally and over Tailscale — revised (2026-11-03)
- **Decision:** Desktop-first UI, running locally and reachable over Tailscale (`tailscale serve` provides HTTPS on the tailnet), so the phone can use it and later install it as a PWA. No public deployment yet.
- **History:** First "desktop browser, localhost only". Revised after studying Quire, which the author uses from an iPhone over Tailscale.

### D3 · Light gamification + cosmetic meta-layer — revised (2026-11-03)
- **Decision:** XP, levels, streaks, quests and stats, plus loot boxes, collectibles, a bedroom and a wardrobe. Everything beyond the core loop is cosmetic; no RPG stats or combat.
- **History:** First "light: streaks, XP, quests; no inventories". Revised when `observations.txt` added loot boxes and the bedroom.

### D4 · Linking = free-form mentions only — accepted (2026-11-03)
- **Decision:** `@`/`[[` mentions in any text field, rendered as live-title chips, plus a backlinks panel on every entity. No typed relations (blocks/depends on) and no behavioral effect (e.g. no goal progress from linked tasks).
- **Why:** The user wants to link tasks, goals, projects or areas inside any field of any other entry; typed and behavioral links were explicitly deferred.

### D5 · Hard active-project limit — accepted (2026-11-03)
- **Decision:** A hard limit on active projects, configurable, default 3. Activating another requires parking one.
- **Why:** The strongest countermeasure to "too many projects at once". The default of 3 was Claude's choice.

### D6 · No study-specific features — accepted (2026-11-03)
- **Decision:** Calendar, recurring schedule blocks, deadlines and countdowns are generic and usable by any project. Courses are ordinary projects (templates later).

### D7 · English UI — accepted (2026-11-03)
- **Decision:** English only; no i18n framework yet. UI strings stay in one place per feature so i18n can be added later without a hunt.

### D8 · Gamification derived from an activity log — accepted (2026-11-03)
- **Decision:** Counting mutations write an append-only `activity` row in the same transaction. XP, levels, streaks and quest progress are computed from it by pure functions; a cached snapshot can be rebuilt.
- **Why:** Rules can change and history can be recomputed; supports retroactive rewards (loot for past quests) and future friend feeds.

### D9 · Stack: React + Vite, Hono, SQLite + Drizzle, TipTap — superseded by D14 (2026-11-03)

### D10 · Typed quests via a registry — accepted (2026-11-03)
- **Decision:** Quest types (quick, daily, time, make, follow-up, weekly, review, project, comeback; friend/co-op and events later) are modules in an extensible registry: cadence, generator, evaluator, XP, box tier. "Missions" and "quests" are the same thing; the UI says "Quests".
- **Source:** `observations.txt` (reviewing, weekly, time and quick missions).

### D11 · A loot box per completed quest — accepted (2026-11-03)
- **Decision:** Every completed quest grants a loot box; the tier depends on the quest type and shifts rarity odds (Common → Legendary), with a pity timer. Outcomes are rolled **server-side** and stored; recompute never rerolls. **No real-money purchases, ever.**
- **Why:** Source is `observations.txt`. Claude added the constraints: quick quests are capped and give the smallest box so they can't be farmed; no paid loot, for ethics and trust.

### D12 · Bedroom is cosmetic, with a wardrobe — accepted (2026-11-03)
- **Decision:** An isometric room where collectibles are placed; no gameplay effects. A **wardrobe** in it shows off earned medals (achievements) and prizes (milestone trophies), with favorites displayed in the room.
- **Source:** `observations.txt` (bedroom, then the wardrobe).
- **Open:** medals vs. prizes definition (plan.md §13, Q5).

### D13 · Production hosting / social backend — deferred (2026-11-03)
- **Decision:** Deferred by the user. Since D14, social features live in the main backend (no separate Firebase layer). What remains open is where production runs (VPS, PaaS, managed Postgres, Supabase as a host).
- **History:** First posed as Firebase vs. Supabase vs. self-hosted for a hybrid "social layer" while the app was localhost-only.

### D14 · Stack for a potential product — accepted (2026-11-03)
- **Decision:** A TypeScript pnpm monorepo:
  - **Web:** React + Vite SPA, TanStack Router/Query, Tailwind + shadcn/ui, TipTap, dnd-kit, cmdk, PixiJS.
  - **Server:** Hono on Node, Zod, PostgreSQL + Drizzle, Better Auth, pg-boss for jobs.
  - **Tooling:** Vitest + Playwright; Docker Compose.
- **Why:** The project may become a product.
  - Postgres suits a multi-user app with concurrent writes and social queries, and runs the same way in dev and production.
  - React opens the React Native/Expo path for mobile (home-screen widgets, push), and has the largest ecosystem and hiring pool.
- **Alternatives considered:**
  - **Quire's stack (Svelte 5 + Fastify + node:sqlite):** highest code reuse, but SQLite would need a migration before launch, and there's no native-mobile code sharing.
  - **Next.js:** more framework than an app behind a login needs.
  - **BaaS-first (Firebase/Supabase):** quest, streak and loot logic must be server-authoritative anyway, and it means lock-in. Moving *all* data into Firestore would break the relational model (links, backlinks, search).
- **Consequence:** Quire's framework-agnostic TypeScript logic is still reused (plan.md §11).

### D15 · XP is never taken away — accepted (2026-11-03)
- **Decision:** Each source earns XP once, ever. Reopening a task keeps its XP; completing it again earns 0; deleting doesn't remove XP.
- **Why:** Fits "forgiving, never punishing" and prevents farming at the same time. Adapted from Quire's "marks" (only growth past the highest point counts).

### D16 · Make quests with follow-ups and a soft cap — accepted (2026-11-03)
- **Decision:** Make quests (add a task or goal, break a task into subtasks) exist; at most 1 per day, only for active projects. Completing one spawns a **follow-up quest** to fill in any 2 missing details of the new item (all doable in a minute). A **soft cap** makes make quests much less likely as open and undetailed items accumulate, with a hard ceiling (e.g. 3 pending follow-ups).
- **Why:** The user's design, addressing Quire's FIT-3 (make quests produced blank entries faster than fill quests emptied them).
- **Pending confirmation:** the make quest's box is granted when its follow-up is done, or when it expires with the item still existing, so create-then-delete earns nothing (Claude's choice, flagged to the user).

### D17 · Server-authoritative rewards and days — accepted (2026-11-03)
- **Decision:** Only the server computes XP, streaks, quest progress and loot. The user's day comes from their stored timezone and day-start hour, not the client clock; timezone changes are rate-limited.
- **Why:** A consequence of D14 (product) and social features: friend streaks and collectibles must be cheat-resistant. Quire trusted the client's day, which is fine only for a personal app.

### D18 · Daily backups, checked hourly — accepted (2026-11-03)
- **Decision:** The backup job runs every hour and at startup. It writes one `pg_dump` per day (named by the owner's local day) if that day's file doesn't exist yet, and keeps the newest 14. `POST /api/admin/backup` forces one.
- **Why:** The app runs on a laptop that is often off at night. A fixed nightly cron would skip those days; an hourly "make today's backup if missing" check still gives one backup per day of use.
- **History:** plan.md first said "nightly `pg_dump` job". Claude changed it while implementing Phase 0.

### D19 · How deleting works — accepted (2026-11-03, Claude's choice, confirm when convenient)
- **Decision:**
  - **Tasks and goals** are soft-deleted (`deleted_at`), with an **Undo** in the toast. Deleting a task takes its subtasks with it, and Undo brings them back together.
  - **Projects and areas** are written to a **snapshot** (JSON of every row that goes with them: board columns, goals, tasks), then really deleted. Settings → "Deleted projects and areas" restores them with their original ids. A restored active project comes back **parked** if the active limit is full.
  - **Deleting an area** asks what happens to its projects: **keep them** (they move to "No area" and go back into the area on restore) or **delete them with it**.
  - Both kinds last **30 days**; an hourly pg-boss job (`purge`) then removes them for good.
- **Why:** Undo has to be instant for small things, and a soft-deleted task keeps its id for mentions (Phase 2). A project or area takes a lot with it, and a snapshot avoids filtering `deleted_at` across every query that touches projects. Archive remains the way to put something away; delete is for mistakes.
- **History:** plan.md §7 first listed `deleted_at` on areas and projects as well as snapshots; implementing Phase 1 settled on one mechanism per kind.

### D20 · Board and next-action rules — accepted (2026-11-03, Claude's choice, confirm when convenient)
- **Decision:**
  - **Done means `completed_at` is set**, and on a board it always agrees with the column's category. Moving a card into a done column completes it; completing a task moves it to the top of the first done column; reopening moves it to the top of the first open column. Changing a column's category completes or reopens its tasks.
  - **A board always keeps** at least one done column and one open column. Deleting a column moves its tasks to another column of the same category.
  - **Subtasks** are one level deep, always in their parent's project and never on the board. Moving a parent to another project takes its subtasks along.
  - **Next action:** a pinned task while it's open. Otherwise the board picks the top task of the in-progress columns first, then of the to-do columns, left to right. Completing or deleting a pinned task unpins it.
  - **Project lifecycle:** active ↔ parked; either one → completed; completed → active (reopen) or parked; anything → archived; archived → parked only. Activating checks the limit (D5) inside a locked transaction, and the "Park one to continue" dialog parks and activates in one request.
- **Why:** The app needs one definition of "done" (Phase 3 counts completions for XP). Preferring in-progress work is closer to what "next action" means than taking the leftmost column.

### D21 · How mentions and links work — accepted (2026-11-03, Claude's choice, confirm when convenient)
- **Decision:**
  - A mention is a TipTap `mention` node holding the target's **id** and the label it had when inserted (a fallback only). Chips always show the target's current title, fetched in batches through `GET /api/entities/resolve`.
  - Every save of a description **rewrites that source's rows in `links`** in the same transaction. Neither side is a foreign key: either side can be any kind, and a link to something deleted stays (it shows a **broken chip**, struck through, with its old label).
  - **Deleted sources:** a soft-deleted task or goal drops out of backlinks until it's restored. Rows whose source is gone for good (purged, or deleted with a project/area snapshot) are removed by the hourly `purge` job. **Restoring a snapshot rebuilds** the links from the restored descriptions.
  - **Backlinks** show the line each mention is in, built when read, so the mentions in it read with their current titles.
  - Self-mentions aren't links. Asking for the backlinks of another account's id answers 404, like any of their ids.
- **Why:** Links derived from the document can't drift from it (Quire's LOG-8: one function per question). Keeping them across deletes is what makes "deleting shows a broken chip" and undo/restore work without bookkeeping.

### D22 · Detail sheets for goals and areas; descriptions edited in place — accepted (2026-11-03, Claude's choice, confirm when convenient)
- **Decision:**
  - Goals and areas open in **side sheets** like tasks (`?goal=` and `?area=` over any page), with title and description autosaved, their tasks or projects, and the backlinks panel. Clicking a goal in the goals panel, or an area's title in the overview, opens its sheet. Projects keep their page; their description is edited in place on the "Goals & details" tab, with backlinks under it.
  - The project dialog no longer edits an existing project's description (only a new one's), so the rich text has one editor and is never rebuilt from plain text.
  - A sheet's editor only starts from **freshly fetched** data, never from a cached copy, so text changed on another device (the phone) isn't saved over.
- **Why:** The Phase 2 acceptance needs a goal's backlinks panel, and goals and areas had no page. Sheets open from a chip without leaving the page you're on, as tasks already did.

### D23 · Search: full-text with prefixes, typo-tolerant titles — accepted (2026-11-03, Claude's choice)
- **Decision:** Postgres FTS with the `simple` configuration (no stemming, so text in any language matches the same way) over unaccented titles (weight A) and descriptions (weight B); every query word is a prefix, in any order. Titles also match by trigram similarity when **every** query word is close to a word of the title (≥ 0.5, e.g. "algerba" → "Linear algebra"). Ranking: title starts with the query, title contains it, FTS rank, similarity, then open before closed, shorter, recent. Description-only matches return the words around the match. An empty query lists recently changed open things (the mention picker's first view).
- **Why:** The UI is English (D7) but the user may write in Portuguese; stemming for one language would mis-handle the other. Requiring every word to be similar stops one shared word from carrying a multi-word query.

### D24 · What the activity log records and what counts — accepted (2026-11-04, Claude's choice, confirm when convenient)
- **Decision:**
  - Activity types so far: `task_completed`, `task_reopened`, `task_triaged` (an inbox task given a project), `item_created` (task, subtask or goal), `next_action_set`, `focus_completed`, `quest_completed`, `quest_bonus`. Every path that completes a task writes one: the complete button, a drag into a done column, a column turned into a done one, a task created straight into a done column.
  - A task with **no effort set earns as S** (10 XP).
  - A **subtask** earns no XP but **makes the day active** (it's real work done).
  - `local_date` is fixed when the row is written; a later time-zone change never rewrites history.
- **Why:** One log answers "did anything count?" for XP, streaks and quests alike (D8). Unset effort is the common case for quick captures; paying it nothing would punish capturing.

### D25 · Game events through a middleware — accepted (2026-11-04, Claude's choice)
- **Decision:** Services call `recordActivity` / `touch` inside their transactions; an async-local scope collects them per request. After the write commits, the `gameEvents` middleware evaluates quests (under a lock on the user's settings row) and adds a `game` block to the JSON body (XP, level up, streak, freeze, weekly target, quests done or added, and the new state). The web client's `call()` takes the block out and hands it to one handler (toasts, cache update). If the evaluation fails, the response goes out without it and a pg-boss `game` job retries it.
- **Why:** Every write gets the block without each route knowing about it, and the client celebrates the same way everywhere. Failing the evaluation never fails a committed write (Quire's SRV-4).

### D26 · Quest boards and progress — accepted (2026-11-04, Claude's choice, confirm when convenient)
- **Decision:**
  - The day's board (and the week's) is made on **first contact**: the first quest view or counting write of that day. Past quests are expired then; a follow-up whose item is gone is cancelled.
  - **Progress counts only what happens after a quest was offered.** A board made by a write never pays out for that same write.
  - MVP templates: quick (triage one inbox item; pick the next action of a project; tick off a subtask), daily (finish Today's top item; move an untouched project forward; complete a task in a project; complete 2 tasks; a 25-minute session), time (minutes today; minutes this week), weekly (the active-day target), make (add a task; add a goal to a project with none; break an L task into 2 subtasks), follow-up, comeback.
  - A make quest pays its XP when the item is made. Its follow-up asks for 2 of the item's missing parts (a task's goal only when its project has goals); "break it down" has no follow-up (subtasks are just titles). The D16 box rule is kept in the follow-up's status: completed or expired → the make quest's box is due (Phase 5), cancelled → none.
  - Rerolls swap for another quest of the same type that isn't on the board; a replacement can't be rerolled. When nothing else fits, the reroll answers 409.
- **Why:** Counting work done before the board existed made quests complete the moment they appeared (found by the API tests). Lazy boards need no per-timezone midnight job.

### D27 · Focus sessions — accepted (2026-11-04, Claude's choice)
- **Decision:** One running or paused session per user (a partial unique index). The server keeps the start time and pauses; the client counts on from the server's figure. Finishing credits the minutes worked, **capped at the planned length** (a forgotten timer doesn't keep counting). Sessions under 10 minutes still log their minutes (time quests count them) but earn no XP and don't make an active day. "Mark the task done" is a second write in the same request.
- **Why:** Sessions must survive reloads and devices (plan.md §4.4), and an open-ended timer would be the easiest XP farm in the app.

### D28 · Day settings change once a week — accepted (2026-11-04, Claude's choice)
- **Decision:** Time zone **and** day-start hour can change at most once every 7 days (409 `day_settings_locked`); the first change after setup is free. Week start, weekly target, presets and quest settings change any time. A changed weekly target applies to past weeks too (the weekly streak is recomputed with it).
- **Why:** D17 names the time zone; the day-start hour moves the same boundary, so it can farm days the same way.

### D29 · No cached game state yet — accepted (2026-11-04, Claude's choice)
- **Decision:** XP, level and streaks are computed from the user's whole activity log on each request; there is no `stats_snapshot` row. `POST /api/admin/recompute` therefore only re-evaluates open quests and returns the state.
- **Why:** A year of daily use is a few thousand rows, milliseconds to replay. A cache is one more thing that can drift; add it when the log is big enough to need it.

### D30 · Dragging projects between areas — accepted (2026-11-04, the user's idea; details Claude's)
- **Decision:** On the Projects page, projects in progress (active and parked) are cards that drag within an area or into another one, or into "No area" (shown while dragging), like board cards: mouse, touch (a short press) and keyboard (Space, arrows, Space). `POST /api/projects/:id/move { areaId, index }` places it among that area's projects in progress; completed and archived ones keep their places after them and can't be dragged. Projects in an area are shown in their own order now (no longer active first, then parked).
- **Why:** Moving a project used to need its edit dialog, and projects couldn't be ordered at all. Showing them in the order the user set is what makes ordering mean something.

### D31 · Streaky, a guide mascot; the tutorial is a quest chain — accepted (2026-11-04, the user's idea)
- **Decision:** Streaky is the app's mascot, drawn by the user. He guides (the tutorial, tips when you're stuck) and cheers (celebrations). He is **not** a companion that grows with level, has needs or reacts as a pet: that idea was rejected on 2026-11-03 and stays rejected. The tutorial is a chain of welcome quests done in the real app, introduced by Streaky. Both are Phase 4, once the user's drawings arrive.
- **Why:** Personality and a first-run path without explanation screens; the quest system already does chains.

### D32 · The challenge question and "you're not the only one" — accepted (2026-11-04, the user's idea; the multiple-choice form is Claude's)
- **Decision:** Streaky asks "What's your biggest challenge with discipline?" as **multiple choice** over the five failure modes the product is built around (forgetting to start, not knowing what's next, dropping after a missed day, too many projects, fading motivation). The answer tunes the app and can be changed later. Asked in Phase 4. Comparing answers anonymously ("N people share this, you're not the only one") comes with the social phase: opt-in, counts only, shown only when the numbers are real and large enough not to identify anyone. Never invented.
- **Why:** Fixed choices can be counted without reading anyone's text and map to things the app can change. A made-up "many people feel this" would be a lie.

### D33 · Focus clock outside the app, breaks, celebration — accepted (2026-11-04, the user's ideas)
- **Decision:** While a session or break runs, the tab title shows the time left and the favicon a progress ring; an optional mini clock window floats over other windows (Document Picture-in-Picture; Chrome and Edge on desktop, hidden elsewhere). Finishing a session offers the preset's break with its own timer; breaks are skippable and earn nothing. Quest completions and level-ups get a short visual burst besides the chime, unless the system asks for reduced motion. A clock that stays on the phone's screen needs the native app (Phase 10).
- **Why:** Distraction starts when you leave the tab and forget the time; rest matters, but rewarding it would make it farmable.

---

## Rejected ideas (don't propose again)

- **Quire integration** (Quire writing days counting as Streaktron activity) — rejected by the user, 2026-11-03.
- **Familiar / pet companion** that grows with level and reacts (from Quire) — rejected by the user, 2026-11-03.
- **Spaced repetition / Anki-style flashcards inside the app** — left out by the user, 2026-11-04: conflicts with D6 (no study-specific features) and would be a product of its own; Anki already exists.
- **All data in Firestore** — rejected by Claude's analysis (breaks the relational model); superseded anyway by D14.

## Deferred, not rejected

- Typed relations and links with behavioral effects (D4) → backlog.
- Production hosting (D13), friend-streak ordering, bedroom art, business model, medals vs. prizes → plan.md §13.
