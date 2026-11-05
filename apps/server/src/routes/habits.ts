import {
  dateString,
  habitCheckinSchema,
  habitCreateSchema,
  habitPatchSchema,
  idOf,
} from '@strekatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import {
  checkIn,
  createHabit,
  deleteHabit,
  getHabit,
  listHabits,
  restoreHabit,
  uncheck,
  updateHabit,
} from '../services/habits';

const param = validate('param', z.object({ id: idOf('habit') }));

export const habitRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get(
    '/',
    validate('query', z.object({ archived: z.enum(['true', 'false']).optional() })),
    async (c) =>
      c.json({
        habits: await listHabits(c.get('user').id, c.req.valid('query').archived === 'true'),
      }),
  )
  .post('/', validate('json', habitCreateSchema), async (c) =>
    c.json(await createHabit(c.get('user').id, c.req.valid('json')), 201),
  )
  .get('/:id', param, async (c) =>
    c.json(await getHabit(c.get('user').id, c.req.valid('param').id)),
  )
  .patch('/:id', param, validate('json', habitPatchSchema), async (c) =>
    c.json(await updateHabit(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', param, async (c) =>
    c.json(await deleteHabit(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(await restoreHabit(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/checkin', param, validate('json', habitCheckinSchema), async (c) =>
    c.json(await checkIn(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete(
    '/:id/checkin/:date',
    validate('param', z.object({ id: idOf('habit'), date: dateString })),
    async (c) => {
      const { id, date } = c.req.valid('param');
      return c.json(await uncheck(c.get('user').id, id, date));
    },
  );
