import {
  columnCreateSchema,
  idOf,
  projectCreateSchema,
  projectMoveSchema,
  projectPatchSchema,
  projectStatusSchema,
  reorderSchema,
} from '@strekatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { userToday } from '../services/activity';
import { createColumn, listColumns, reorderColumns } from '../services/board';
import { projectCountdowns } from '../services/countdowns';
import { listGoals } from '../services/goals';
import {
  createProject,
  deleteProject,
  moveProject,
  projectView,
  projectViews,
  keepParked,
  setProjectStatus,
  updateProject,
} from '../services/projects';

const param = validate('param', z.object({ id: idOf('project') }));

export const projectRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json({ projects: await projectViews(db, c.get('user').id) }))
  .post('/', validate('json', projectCreateSchema), async (c) =>
    c.json(await createProject(c.get('user').id, c.req.valid('json')), 201),
  )
  /** The project page: the project, its board columns, its goals and its countdowns. */
  .get('/:id', param, async (c) => {
    const userId = c.get('user').id;
    const { id } = c.req.valid('param');
    const [project, today] = await Promise.all([
      projectView(db, userId, id),
      userToday(db, userId),
    ]);
    const [columns, goals, countdowns] = await Promise.all([
      listColumns(db, userId, id),
      listGoals(db, userId, id),
      projectCountdowns(db, userId, project, today),
    ]);
    return c.json({ project, columns, goals, countdowns });
  })
  .patch('/:id', param, validate('json', projectPatchSchema), async (c) =>
    c.json(await updateProject(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  /** Drag on the Projects page: to an area (or none) and a position among its projects. */
  .post('/:id/move', param, validate('json', projectMoveSchema), async (c) =>
    c.json({
      projects: await moveProject(c.get('user').id, c.req.valid('param').id, c.req.valid('json')),
    }),
  )
  /** Lifecycle; 409 `active_limit` (with the active projects) when over the limit (D5). */
  /** A parked project revisited and kept parked (D43). */
  .post('/:id/keep-parked', param, async (c) =>
    c.json(await keepParked(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/status', param, validate('json', projectStatusSchema), async (c) =>
    c.json({
      projects: await setProjectStatus(
        c.get('user').id,
        c.req.valid('param').id,
        c.req.valid('json'),
      ),
    }),
  )
  .delete('/:id', param, async (c) =>
    c.json(await deleteProject(c.get('user').id, c.req.valid('param').id)),
  )
  .post('/:id/columns', param, validate('json', columnCreateSchema), async (c) =>
    c.json(await createColumn(c.get('user').id, c.req.valid('param').id, c.req.valid('json')), 201),
  )
  .post('/:id/columns/reorder', param, validate('json', reorderSchema), async (c) =>
    c.json({
      columns: await reorderColumns(
        c.get('user').id,
        c.req.valid('param').id,
        c.req.valid('json').ids,
      ),
    }),
  );
