import { idOf } from '@strekatron/shared/schemas';
import {
  areaCreateSchema,
  areaDeleteQuerySchema,
  areaPatchSchema,
  reorderSchema,
} from '@strekatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { createArea, deleteArea, listAreas, reorderAreas, updateArea } from '../services/areas';

const param = validate('param', z.object({ id: idOf('area') }));

export const areaRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json({ areas: await listAreas(c.get('user').id) }))
  .post('/', validate('json', areaCreateSchema), async (c) =>
    c.json(await createArea(c.get('user').id, c.req.valid('json')), 201),
  )
  .post('/reorder', validate('json', reorderSchema), async (c) =>
    c.json({ areas: await reorderAreas(c.get('user').id, c.req.valid('json').ids) }),
  )
  .patch('/:id', param, validate('json', areaPatchSchema), async (c) =>
    c.json(await updateArea(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))),
  )
  .delete('/:id', param, validate('query', areaDeleteQuerySchema), async (c) =>
    c.json(
      await deleteArea(c.get('user').id, c.req.valid('param').id, c.req.valid('query').projects),
    ),
  );
