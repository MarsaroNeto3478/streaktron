// The game and the day: state, quests, focus sessions, Today's list, stats.

import {
  dayRangeSchema,
  focusFinishSchema,
  focusStartSchema,
  idOf,
} from '@strekatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { userToday } from '../services/activity';
import {
  abandonFocus,
  currentFocus,
  finishFocus,
  pauseFocus,
  resumeFocus,
  startFocus,
} from '../services/focus';
import { getGameState, heatmap, questBoard, rerollQuest } from '../services/game';
import { todayCountdowns } from '../services/countdowns';
import { occurrencesIn } from '../services/events';
import { todayHabits } from '../services/habits';
import { focusList } from '../services/today';

export const gameRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** XP, level, daily and weekly streaks, freezes. */
  .get('/state', async (c) => c.json(await getGameState(c.get('user').id)));

export const questRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** Today's and this week's quests; viewing brings their progress up to date. */
  .get('/', async (c) => {
    const { today, quests, game } = await questBoard(c.get('user').id);
    return c.json(game ? { today, quests, game } : { today, quests });
  })
  .post('/:id/reroll', validate('param', z.object({ id: idOf('quest') })), async (c) =>
    c.json(await rerollQuest(c.get('user').id, c.req.valid('param').id)),
  );

export const todayRoutes = new Hono<AuthedEnv>().use(requireUser).get('/', async (c) => {
  const userId = c.get('user').id;
  const today = await userToday(db, userId);
  const [focus, habits, agenda, upcoming] = await Promise.all([
    focusList(db, userId, today),
    todayHabits(db, userId),
    occurrencesIn(db, userId, today, today),
    todayCountdowns(db, userId, today),
  ]);
  return c.json({ today, focus, habits, agenda, countdowns: upcoming });
});

const focusParam = validate('param', z.object({ id: idOf('focusSession') }));

export const focusRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/current', async (c) => c.json({ session: await currentFocus(c.get('user').id) }))
  .post('/start', validate('json', focusStartSchema), async (c) =>
    c.json(await startFocus(c.get('user').id, c.req.valid('json')), 201),
  )
  .post('/:id/pause', focusParam, async (c) =>
    c.json(await pauseFocus(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/resume', focusParam, async (c) =>
    c.json(await resumeFocus(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/finish', focusParam, validate('json', focusFinishSchema), async (c) =>
    c.json(await finishFocus(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .post('/:id/abandon', focusParam, async (c) =>
    c.json(await abandonFocus(c.get('user').id, c.req.valid('param').id)),
  );

export const statsRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** One entry per day with something in it (the contribution heatmap). */
  .get('/heatmap', validate('query', dayRangeSchema), async (c) => {
    const { from, to } = c.req.valid('query');
    return c.json({ days: await heatmap(c.get('user').id, from, to) });
  });
