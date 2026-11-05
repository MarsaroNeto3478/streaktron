import {
  idOf,
  taskCreateSchema,
  taskListQuerySchema,
  taskMoveSchema,
  taskPatchSchema,
} from '@strekatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  reopenTask,
  restoreTask,
  updateTask,
} from '../services/tasks';

const param = validate('param', z.object({ id: idOf('task') }));

export const taskRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', validate('query', taskListQuerySchema), async (c) =>
    c.json({ tasks: await listTasks(c.get('user').id, c.req.valid('query')) }),
  )
  .post('/', validate('json', taskCreateSchema), async (c) =>
    c.json(await createTask(c.get('user').id, c.req.valid('json')), 201),
  )
  .get('/:id', param, async (c) => c.json(await getTask(c.get('user').id, c.req.valid('param').id)))
  .patch('/:id', param, validate('json', taskPatchSchema), async (c) =>
    c.json(await updateTask(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .post('/:id/complete', param, async (c) =>
    c.json(await completeTask(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/reopen', param, async (c) =>
    c.json(await reopenTask(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/move', param, validate('json', taskMoveSchema), async (c) =>
    c.json(await moveTask(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', param, async (c) =>
    c.json(await deleteTask(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/restore', param, async (c) =>
    c.json(await restoreTask(c.get('user').id, c.req.valid('param').id)),
  );
