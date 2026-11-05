import {
  dayRangeSchema,
  eventCreateSchema,
  eventPatchSchema,
  eventSkipSchema,
  idOf,
} from '@streaktron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import {
  calendarRange,
  createEvent,
  deleteEvent,
  getEvent,
  restoreEvent,
  skipOccurrence,
  updateEvent,
} from '../services/events';

const param = validate('param', z.object({ id: idOf('event') }));

export const eventRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .post('/', validate('json', eventCreateSchema), async (c) =>
    c.json(await createEvent(c.get('user').id, c.req.valid('json')), 201),
  )
  .get('/:id', param, async (c) =>
    c.json(await getEvent(c.get('user').id, c.req.valid('param').id)),
  )
  .patch('/:id', param, validate('json', eventPatchSchema), async (c) =>
    c.json(await updateEvent(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', param, async (c) =>
    c.json(await deleteEvent(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(await restoreEvent(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/skip', param, validate('json', eventSkipSchema), async (c) =>
    c.json(
      await skipOccurrence(c.get('user').id, c.req.valid('param').id, c.req.valid('json').date),
    ),
  );

/** Occurrences, dated tasks and focus minutes for a range of days. */
export const calendarRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', validate('query', dayRangeSchema), async (c) => {
    const { from, to } = c.req.valid('query');
    return c.json(await calendarRange(c.get('user').id, from, to));
  });
