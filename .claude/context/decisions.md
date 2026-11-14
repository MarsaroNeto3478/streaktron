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
  - Rerolls swap for another quest of the same type that isn't on the board; a replacement can't be rerolled *(changed by D47: a replacement can be rerolled again on a later day)*. When nothing else fits, the reroll answers 409.
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

### D34 · How habits count — accepted (2026-11-04, Claude's, within plan.md §5)
- **Decision:** Two schedules: certain weekdays (all seven = every day) or N times a week. A habit's own streak counts scheduled days (or weeks that reached N) in a row since it was made; today (this week) only adds. A check-in earns 10 XP **once per habit and day** and makes the day active; unchecking deletes the check-in but keeps the XP (D15), and checking in again earns nothing more. A **forgotten check-in can be made for yesterday only**: it counts for the habit's streak, but its XP and active day go to **today**, so past days (and the daily streak) can't be filled in afterwards (D17). Habit notes are plain text, not rich text: habits aren't mention sources. "At least N minutes" is a reminder of the bar, not checked against focus time. New quests: quick "Check in one habit" and daily "Check in all N habits due today" (needs 2+ due).
- **Why:** Forgetting to tap is common and shouldn't break a habit's run; letting yesterday's tap also save yesterday's daily streak would make streaks farmable. Keeping habits out of mentions avoids a second backlink source for little gain.
- **Alternatives:** Any past day (farmable); no backdating at all (punishes a forgotten tap); rich-text descriptions (more plumbing, little use).

### D35 · How the calendar stores and shows events — accepted (2026-11-04, Claude's)
- **Decision:** Events live on the user's **local dates and wall-clock times** ("floating"): `start_date`, optional `end_date` (all-day events spanning days), optional `start_time`/`end_time` ("HH:MM", same day; none = all day). This replaces the `start_at`/`end_at` timestamps sketched in plan.md §7. Repetition is a tested subset of RFC 5545 RRULE (every day / week on chosen weekdays / month on the same day / year, every N, until a date or N times), stored as a real RRULE string; skipped occurrences are a list of dates (EXDATE). Editing the rule (or the start date) clears the skips; "Only this one" skips one occurrence; editing a single occurrence isn't supported yet. A **countdown** is a flag on an event: Today shows the next occurrence of each countdown event. On the calendar, a task shows on its scheduled day (else its due day); **dragging a task to a day sets its scheduled date** (the due date, a deadline, is never moved by a drag). Event notes are plain text (like habits, D34).
- **Why:** Lectures and exams are wall-clock things: a 9:00 class must stay at 9:00 across DST and time-zone changes, and day arithmetic on `YYYY-MM-DD` is already the codebase's rule. A small, exhaustively tested expander beats a dependency for the five patterns people use; storing real RRULE keeps an iCal import or a full library possible later.
- **Alternatives:** UTC timestamps plus a time zone (DST bugs, more code everywhere); the `rrule` library (bigger, time-zone pitfalls); dragging moving the due date (it would silently change deadlines).

### D36 · How Streaky's tour runs, and what the challenge answer tunes — accepted (2026-11-05, the user chose among Claude's proposals)
- **Decision:** The tour is a new quest type, `tutorial`: five steps (create an area, start a project, add a task to a project, complete a task, focus 10 minutes), one open at a time, each spawning the next when done or skipped; it shows in a Streaky card on Today, not on the quest board. Steps stay open for a year (done at your own pace). Each step gives 20 XP and a small box, the last 50 XP and a large box (D11); a step's reward is earned **once per account**: taking the tour again (Settings → "Take the tour") replays steps already rewarded for 0 XP (`replay`, and no box in Phase 5). Every account starts with an **invitation** on Today ("Show me around" / "Not now"); new and existing accounts alike. Starting the tour asks the challenge question first (skippable). Creating an area or project now logs `item_created` (kinds `area`, `project`); it earns nothing and doesn't make an active day. The answer tunes the app: *forgetting* → one more quick quest a day; *next step* → Today shows 3 items instead of 5 and "pick the next action" quests weigh double; *missed day* → the weekly streak shows before the daily one and the comeback quest comes after 1 missed day instead of 2; *too many projects* → the active limit drops to 2 (only lowered, never raised; a limit set in the same change wins); *motivation* → a daily quest doesn't come back for 3 days when there are others. The answer can be changed in Settings. Numbers are in `GAME.challenge`.
- **Why:** The quest system already does chains and rewards, so the tour costs little and teaches by doing. An invitation (not a forced tour) respects someone who already uses the app. Earning each reward once keeps "replay the tour" from being an XP farm (D15). Each tuning maps one failure mode (plan.md §1) to something the app already controls.
- **Alternatives:** A tour only for new accounts (the author couldn't try it); a forced tour; tutorial quests on the normal board (lost among the day's quests); only storing the answer without tuning anything.

### D37 · Habit XP can't be farmed — accepted (2026-11-05, found by the user; the rules are Claude's proposal, chosen by the user)
- **Decision:** A habit check-in on the day the habit was made earns **0 XP** (it still makes the day active and starts the habit's streak). From the next day on it earns 10 XP as before, and habits earn **at most 50 XP a day** in all (`GAME.xp.habitDailyCap`); past the cap check-ins still count for the day. The check-in's activity carries `habitCreatedOn`; check-ins logged before this rule have none and keep their XP (D15: XP is never taken away; no past day went over the cap).
- **Also decided (the user, same day):** the active-day rule stays as it is: finishing a quest or creating things doesn't make a day active, only a completed task, 10+ minutes of focus or a habit check-in. "If it takes very little, the person doesn't improve." The app now says so where it matters (the streak card, the "Quest done" toast while today doesn't count yet, and the detail of quests that don't count by themselves).
- **Why:** The user found that creating a habit and checking it in gave 10 XP every time, without limit. Earn-once per habit and day (D34) didn't cover new habits.
- **Alternatives:** Only the first-day rule (making 100 habits today still pays tomorrow); only a daily cap (create-and-check would still pay up to the cap); counting quests as active days (rejected by the user: too little effort).

### D38 · The weekly review — accepted (2026-11-05, the user chose among Claude's proposals)
- **Decision:** One review per week, at `/review` (menu, palette, `G R`), in six steps: the last seven days (tasks done, focus, active days, habit check-ins, XP, and where the work went), what stalled (active projects with no finished task and no focus in seven days), the inbox, next actions (pin one per active project), active and parked projects (park or activate), and two plain-text questions ("What went well?", "What will you do differently?"; both optional). Today shows a reminder card in the **review window**: the last two days of the user's week and the first day of the next; a review done on that first day still counts for the week before. Outside the window it can still be done from the menu. Doing it logs `review_completed`: **50 XP once per week**, and it **makes the day active** (the user's call: five minutes of real work on the week). A new quest type `review` ("Do the weekly review", 50 XP, large box) is offered each week, open through the next week's first day, completed only by that week's review. The review is stored in `weekly_reviews` with its numbers, for the history at the bottom of the page.
- **Why:** The plan's review ritual (§4, Phase 4) fights novelty wearing off and projects stalling. The window matches when people naturally look back; one per week keeps it from being farmed. The reflection is plain text, like habit and event notes (D34, D35): no mentions to resolve from a review.
- **Alternatives:** Available any day without a reminder; a fixed day chosen in Settings; a review that only gives XP and doesn't count as an active day (the user chose that it counts); a rich-text reflection with mentions.

### D39 · Countdowns are automatic — accepted (2026-11-05, the user chose Claude's recommendation)
- **Decision:** Nothing is marked by hand besides events (D35). **Today** counts down to events marked "count down" and to the due dates of **active** projects (not parked, not overdue). A **project page** counts down to its own due date, its countdown events and the next **three** due dates of its open tasks. Past dates don't show; a countdown within 3 days turns amber; clicking one opens the event, project or task. One component (`components/countdowns.tsx`) draws both.
- **Changed the same day (the user's call):** tasks count down on Today too, with the others: the next **three** open tasks (inbox or active projects), by their due date or, without one, the day they're planned for; a project page uses the same date for its tasks. And a task's due or planned date in task rows turns **amber** within 3 days, like the countdowns (`isSoon`, `SOON_DAYS` in `@strekatron/shared/calendar`); an overdue date stays red.
- **Why:** Deadlines already live on projects and tasks; asking to mark them again would be busywork. Three tasks keep Today short.
- **Alternatives:** A "count down" flag on tasks and projects too; automatic with a way to hide one.

### D40 · Commitment goal progress and pace — accepted (2026-11-05, Claude, following plan §4.6)
- **Decision:** A commitment goal counts **all finished focus on its project** (from the `focus_completed` log, by the day it counted for) in the current period: the user's week (their week start) or the calendar month, cut short by the goal's "Until" date. It shows a bar with a tick where an even pace would be by today, and the **pace**: *on track* (at or above the even pace), *behind* (amber, "Behind · 25 min a day to go"), *target met* (green) or *ended* (after "Until", the last period stays on show). "Minutes a day to go" is what's left over the days left, today included, rounded up. It also counts the **streak** of periods met (the finished ones before this, plus this one once met) and, in the goal sheet, the last four periods. Periods that ended before the goal was created don't count. Two commitment goals on one project share its focus. **No XP or quest** for hitting the target: the focus already earned its XP (D15); the project quest type (plan §5) will use this progress later. Pure rule in `packages/shared/structure/goals.ts`; the API sends `progress` with each commitment goal.
- **Why:** It's the plan's spec (§4.6: "progress bar from focus minutes on the project in the current period; pace"). Counting the whole project avoids asking to tie each session to a goal.
- **Alternatives:** Only focus on the goal's own tasks; XP or a box when the target is met.

### D41 · The project is renamed Strekatron — accepted (2026-11-05, the user's call)
- **Decision:** This repo's app is now **Strekatron** everywhere: the UI, the packages (`@strekatron/shared`, `/server`, `/web`), the Docker Compose project (`name: strekatron`, so its volume `strekatron_pgdata` no longer depends on the folder's name), the database, its role and the test database (`strekatron`, `strekatron_test`), the backup files (`strekatron-YYYY-MM-DD.dump`) and the docs. The live data moved over intact: the role and databases were renamed in place, the old volume `streaktron_pgdata` was copied to the new one and kept as a fallback, and a dump taken just before is in `data/backups/pre-rename/`. Not renamed: the GitHub repository (the user renames it on GitHub; the remote follows), the partner's `JVGdev/streaktron`, the local folder, and the past entries of the logbook and progress log (they're a record).
- **Why:** The user's choice of name for their version of the two parallel apps.

### D42 · "Work on every active project" weekly quest — accepted (2026-11-05, Claude, following plan §5)
- **Decision:** Weekly quests are now the plan's fixed set: "Be active on N days this week" (already there) and **"Work on all N active projects this week"** (`weekly.projects`). It lists the projects active when it's offered; each needs a **finished task** (subtasks too) or a **focus session of 10 minutes or more** on it during the week. A project **parked, completed or deleted** during the week is let off (parking is the review's good decision, not a failure). Offered once a week, only with **two or more** active projects (one project is the weekly target's job); 60 XP + 10 per project, at most 100; large box. It has its own check, so a week whose board was made before it still gets one. Resting "weekly" in Settings turns both off.
- **Why:** It fights the failure mode "projects stall unnoticed" (§1) next to the weekly review, and rewards spreading effort without asking for much in each project.
- **Alternatives:** Counting any activity (a created task, a next action) as touching a project (too little effort, like D37's call on quests); requiring the parked project anyway.

### D43 · "Revisit a parked project" quest — accepted (2026-11-05, the user chose this slice; Claude's design, following plan §5)
- **Decision:** A new activity `project_revisited { decision }` (migration `0010_project_revisited`) is logged when a **parked** project is moved on (made active, completed or archived) or when the user presses **"Keep parked"** (`POST /api/projects/:id/keep-parked`, only for parked projects). It earns no XP and doesn't make an active day (a decision, not work). A `review` quest **"Revisit “X”"** is offered once a week for the parked project decided on longest ago (parked or last revisited), once it has waited **7 days**; it's done by **any** decision on that project during the week, keeping it parked included. 50 XP, large box; resting "review" turns it off. A parked project's page shows a banner with Keep parked / Make active / Complete / Archive, and the weekly review's parked list gets "Keep parked".
- **Why:** Plan §5's review type ("Revisit one parked project and decide keep/drop"). Parked projects otherwise sit forgotten; the quest asks for a decision, not for taking the project back on, so it never pushes past the active limit (D5).
- **Alternatives:** Only counting reactivation or closing (would nudge people over their active limit); a decision on any parked project instead of a named one.

### D44 · Project quests from goals and deadlines — accepted (2026-11-05, the user said "siga em frente"; Claude's design, following plan §5)
- **Decision:** A new quest type `project` (migration `0011_project_quests`), **one a week**, picked by weight from active projects' goals and deadlines:
  - **`project.goal_tasks`** — an open outcome goal with open tasks: "Finish N tasks of “goal”", N = its open top-level tasks, at most 3; 40 + 15·N XP. A deadline inside the week ends the quest that day, and a deadline within 14 days makes it likelier.
  - **`project.commitment`** — a commitment goal not met yet: "Focus X for “goal”", X = this week's share of what's left of its period (all of it for a weekly goal; for a monthly one, the part for the days of this week), at least 15 min, rounded to 5; 50 + X/6 XP (at most 100). Counts focus on the goal's project.
  - **`project.deadline`** — an active project due within 14 days with open tasks: "Finish N tasks in “project” before it's due" (N ≤ 3), ending on its due date; likelier within 7 days.
  - Large box; rerollable; restable in Settings ("project"). Like every quest, it counts only what happens after it's offered.
- To know a finished task's goal, **`task_completed` now carries `goalId`** (optional: older rows don't have it).
- **Why:** Plan §5's project type ("Finish 3 tasks of goal X before Friday · Reach 50% of commitment goal Y this week"); it ties quests to what the user is actually aiming for, and D40's progress gives the commitment share.
- **Alternatives:** Several project quests a week (more noise than help); counting tasks completed before the quest appeared (would make the quest free).

### D52 · Project templates — accepted (2026-11-14, Phase 6)
- **Decision:** Four built-in templates, picked under "Start from" in the new-project dialog (Blank stays the default): **Course** (To study / Studying / To review / Done; 3 h a week of study; "Pass the exam"; asks for the exam date and the weekly class days and times), **Exam prep** (5 h a week of review; "Ready for the exam"; asks for the exam date), **Paper or thesis** (4 h a week of writing; research, first draft and final version as goals; asks for the deadline), **Personal project** (Ideas / To do / Doing / Done; 2 h a week; "First version working"). Each brings its columns, goals, 2–3 first tasks, an icon and a color.
  - A date given becomes an event with a countdown (`Exam: <title>`, `Deadline: <title>`), the dated goal's due date and the project's due date (when none was typed). Class days and times become one weekly event (`Class: <title>`) from today, until the exam when there is one. Everything the template asks for is optional.
  - Templates are static data (`PROJECT_TEMPLATES` in `@strekatron/shared/structure`); the server builds the project, columns, goals, tasks and events in one transaction (`createProject` with `template`).
  - Goals, tasks and events from a template aren't logged as things the user made (`item_created`): a template is a starting point, not work, so it can't complete make or tutorial quests.
- **Why:** The user's projects are mostly courses, exams and the thesis; starting them with the board, a weekly commitment and the exam on the calendar removes the empty-project moment that Streaky's tips warn about. Built-in first; saving one's own project as a template goes to the backlog.
- **Alternatives:** User-made templates now (more UI and a table, before knowing which built-ins get used).

### D51 · Export and import — accepted (2026-11-14, Phase 6)
- **Decision:** Settings → *Your data*. **Export** (`GET /api/data/export`) downloads one JSON file (`format: strekatron-export`, `version: 1`) with the settings and every row of the account's 17 data tables (areas to snapshots, the activity log, quests, boxes, inventory, medals), user ids left out. **Import** (`POST /api/data/import`) is a **restore, not a merge**: it replaces everything the account has with the file's rows, keeping their ids, in one transaction. Before it starts, a copy of the current data goes to `DATA_DIR/exports/before-import-<time>.json`. Columns that point forward or at their own table (a project's next action, a subtask's parent, a quest's parent or reroll) are filled in on a second pass. A malformed file answers 400 and an id owned by another account 409, with nothing changed. Sign-in data, push subscriptions (they belong to devices) are not exported.
- **Why:** The main uses are a copy to keep, moving to another install (the product, or comparing with the partner's version), and undoing a bad experiment; all three want the account exactly as it was. Merging two histories would break the earn-once rules (D15) and the derived game state. The activity log is append-only (D8), but a restore replaces the account wholesale, like deleting it and bringing it back.
- **Alternatives:** Merge import (rejected above); per-project export (the snapshots already do that inside the app).

### D50 · The stats page — accepted (2026-11-14, Phase 6)
- **Decision:** One endpoint, `GET /api/stats/overview?weeks=4|12|26|52` (default 12), from a pure `statsOverview` in `@strekatron/shared/game`; the server adds project and area names and quest outcomes. The page shows:
  - **Totals** for the range (focus, tasks done, XP, active days), each against the same number of weeks just before (percent change; nothing when the weeks before had none).
  - **Week by week**: one column chart, one measure at a time (focus, tasks, XP, active days), with a hover/focus tooltip and a screen-reader table.
  - **Focus by project or by area** (top 8, then "Everything else"), **quest outcomes by type** (done vs. let expire, for quests whose time is over; rerolled and tutorial quests left out), and the **streak history** (every run of 2+ days, longest first, freezes bridging a missed day as in the streak itself; `dailyStreak` got an optional per-day callback for this).
  - The heatmap stays at the bottom; the level/streak header left this page (it's on Today).
  - A task counts once, on its first completion (reopened and done again is still one), like XP; the repeat still makes its day active.
- **Why:** The phase's acceptance is "a truthful story of where time went": totals with a comparison, a trend, where the focus went, and whether quests fit. One hue everywhere: each chart shows one measure, so color carries no identity (the project's own color is only a small dot by its name).
- **Alternatives:** A chart library (Recharts): not needed for columns and bars, and it would add weight to the bundle.

### D49 · Medals and prizes — accepted (2026-11-14, Phase 6; settles Q5)
- **Decision:** Medals mark steady effort; prizes mark milestones (Q5's working definition, kept).
  - **Medals** (tiered, bronze to diamond in the UI): tasks done 1/10/100/500/1000 (each task once, subtasks don't count); focus hours 1/10/50/100/500; weekly reviews 1/10/26/52; quests 1/50/200 (replays don't count); clean sweeps (every daily quest in a day) 1/10; habit check-ins 30/100/365; a comeback quest done; levels 5/10/20/30.
  - **Prizes:** daily streak 7/30/100/365 days; weekly target 4/12/26/52 weeks in a row; one per finished project (`project.<id>`, its title kept).
  - Derived from the activity log by a pure function (`achievementStatus` in `@strekatron/shared/game`), with the day each target was first reached (streaks by binary search over days, since the longest run only grows). The server stores each one the first time (`achievements`, unique per user and key) and never takes it back, so medals reached before this existed arrive with their real day, and a reopened project keeps its prize.
  - Granted after every quest evaluation (writes, board views) and when the Medals page is read; the `game` block lists new ones (`achievements`), shown as toasts (one toast when there are more than two).
- **Why:** Same pattern as XP and boxes (derived, earn once, retroactive). Streak milestones as prizes because they're trophies of a period, not of an amount of work.
- **Alternatives:** Medals for loot (boxes opened, album %): left out so medals reward the work, not luck.

### D48 · Loot boxes and the collection (Phase 5) — accepted (2026-11-14)
- **Decision:**
  - **Art:** Kenney's *Furniture Kit* (CC0: commercial use, no credit required), the isometric sprites in four directions, as placeholder art that already fits the isometric bedroom (Phase 7). The user chose "a CC0 pack from the internet".
  - **Catalogue:** 83 items in 9 categories (beds, seating, tables & desks, storage, lighting, plants, tech, decor, rugs) and 4 sets (basics, study, cozy, modern): 29 Common, 26 Uncommon, 17 Rare, 7 Epic, 4 Legendary. (First 66; the user asked for more the same day: 17 bedroom variations from the same kit were added. Kitchen, bathroom and laundry pieces stay out, since they don't fit a bedroom; walls, floors, doors and stairs wait for Phase 7.) Static data in `@strekatron/shared/collectibles`; keys are stored, so they're never renamed or removed. Footprints and surfaces are first guesses for Phase 7.
  - **Odds** (per mille, common to legendary): small 700/220/60/17/3 · standard 600/250/100/40/10 (plan §4.9) · large 450/300/150/75/25 · special 300/300/220/130/50.
  - **Pity:** a box is Rare or better when the 9 opened before it had none, Epic or better when the 29 before it had none (so every 10 in a row has a Rare+, every 30 an Epic+). The odds are renormalized above that floor; the item is uniform within its rarity.
  - **Granting** reconciles from the quests table (`grantBoxes`, unique on `quest_id`): it runs at the end of every quest evaluation and when the loot list is read. That one rule gives the retroactive boxes (the first run grants one per quest completed before), never twice. Replays (worth 0 XP, D15) earn no box. A make quest's box waits for its follow-up: granted when that's done or expires with the item there, never when it's cancelled (D16).
  - Rolled server-side with crypto randomness when opened, and stored. The write's `game` block has `boxesEarned`; the app shows a toast, a gift chip in the top bar and a count on Collection in the sidebar.
- **Why:** Reconciling instead of granting at each completion keeps one code path for new, delayed (make) and retroactive boxes. Duplicates are kept (plan §4.9).
- **Alternatives:** Drawing the art ourselves (slow, not the point of this phase); a free non-isometric pack (it would have to be replaced for the bedroom).

### D47 · One reroll per quest per day — accepted (2026-11-14, the user's idea in `observations.txt`: "Quests should have a one-time-a-day rerrol for each")
- **Decision:** A quest can be rerolled once a day. The replacement can't be rerolled the same day (it was offered today), but on a later day it can be swapped once more; for day-long quests nothing changes, for week-long ones (the weekly time quest, project quests) it means one swap per day instead of one per week. Project quests are now rerollable, as D44 said (`rerollable` had left them out). The rule is `canRerollNow` in `@strekatron/shared/game`; the day a replacement was offered comes from its `offered_at` in the user's day.
- **Why:** Matches plan §5 ("one reroll per quest per day") and lets a weekly quest that stopped fitting be changed again without letting the user spin it many times in one day.
- **Alternatives:** A daily reroll budget shared by all quests (simpler to explain, but one bad quest could eat everyone's reroll).

### D46 · Streaky's tips on Today — accepted (2026-11-14, the user said "faça o proximo passo"; Claude's design, following D31)
- **Decision:** Streaky shows **one tip at a time** on Today, below the tour and review cards and only once his tour is closed. Tips are picked by pure rules in `@strekatron/shared/tips`, most pressing first: the **streak needs today** (evening of the user's day, a streak going, nothing counted yet; offers a focus session), an **active project with no next action** (with or without open tasks; opens the project), **no active project** with an empty Today, an **inbox of 10+ tasks**, and otherwise a **general tip for the user's challenge** (D32), two per challenge, rotating by day. Each tip can be put away with the X: it stays hidden for 1–3 days, kept in the browser (`localStorage`), so nothing new is stored on the server.
- **Why:** D31 ("tips when you're stuck"). The rules use data Today already loads, so tips cost no API or migration. One tip, not a list, so Streaky stays a helper and doesn't nag.
- **Alternatives:** Keeping put-away tips on the server (follows you across devices; a column and an endpoint for little gain now); several tips at once; tips written by an AI (not now: fixed, honest text first).

### D45 · PWA and Web Push reminders — accepted (2026-11-13, the user said "ja pode começar o proximo passo"; Claude's design, following plan §4.6 and Phase 4)
- **Decision:** Strekatron is an installable **PWA**: `manifest.webmanifest` (start at `/today`, standalone, dark theme), PNG icons made from Streaky's small icon (192, 512, a maskable 512 and the iPhone's 180), and a **service worker** (`public/sw.js`) that only shows pushes and opens the app where they point. It caches nothing: **no offline data** (plan). **Web Push** with VAPID through the `web-push` library; the keys come from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` or are made once and kept in `DATA_DIR/vapid.json` (a new pair would orphan every device). Devices are kept in `push_subscriptions`; a device the push service says is gone (404/410) is forgotten. A pg-boss job runs **every minute**: a running focus session whose planned time is up gets one push ("Focus time is up", same tag as the in-tab notification, so they don't double), and the day's reminders go out **once per user day** each (`push_sent`) when their hour comes in the user's day (an hour past midnight before the day start still counts as late): **habits left today** (on by default, 20:00), **streak at risk** (opt-in, 21:00: nothing counted today and a streak to keep). Settings has "Notifications on this device" (turn on/off, send a test, hints for HTTPS and the iPhone's Home Screen) and "Reminders" (each one on/off with its hour). Rules are pure in `@strekatron/shared/push` (migration `0012_push`).
- **Why:** Plan Phase 4 ("PWA: manifest, service worker (no offline data), install on phone over Tailscale HTTPS"; "Web Push reminders: habits due, focus ended, opt-in streak at risk, max one per day"). One minute job instead of one delayed job per focus session: pausing and resuming need no rescheduling.
- **Alternatives:** Hand-written Web Push encryption (no dependency, more code to get right); a per-session delayed job for the focus push; offline caching (rejected by the plan for now).

---

## Rejected ideas (don't propose again)

- **Quire integration** (Quire writing days counting as Strekatron activity) — rejected by the user, 2026-11-03.
- **Familiar / pet companion** that grows with level and reacts (from Quire) — rejected by the user, 2026-11-03.
- **Spaced repetition / Anki-style flashcards inside the app** — left out by the user, 2026-11-04: conflicts with D6 (no study-specific features) and would be a product of its own; Anki already exists.
- **All data in Firestore** — rejected by Claude's analysis (breaks the relational model); superseded anyway by D14.

## Deferred, not rejected

- Typed relations and links with behavioral effects (D4) → backlog.
- Production hosting (D13), friend-streak ordering, bedroom art, business model, medals vs. prizes → plan.md §13.
