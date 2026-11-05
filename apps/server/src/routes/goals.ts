import { goalCreateSchema, goalPatchSchema, idOf } from '@strekatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { createGoal, deleteGoal, getGoal, restoreGoal, updateGoal } from '../services/goals';

const param = validate('param', z.object({ id: idOf('goal') }));

export const goalRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .post('/', validate('json', goalCreateSchema), async (c) =>
    c.json(await createGoal(c.get('user').id, c.req.valid('json')), 201),
  )
  .get('/:id', param, async (c) => c.json(await getGoal(c.get('user').id, c.req.valid('param').id)))
  .patch('/:id', param, validate('json', goalPatchSchema), async (c) =>
    c.json(await updateGoal(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', param, async (c) =>
    c.json(await deleteGoal(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(await restoreGoal(c.get('user').id, c.req.valid('param').id)),
  );
