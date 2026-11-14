// Loot boxes and the collection (plan.md §4.9, D48).

import { idOf } from '@strekatron/shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { collectionView, lootView, openBoxes } from '../services/loot';

export const lootRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** Unopened boxes (granting any earned and not granted yet). */
  .get('/', async (c) => c.json(await lootView(c.get('user').id)))
  .post('/open-all', async (c) => c.json(await openBoxes(c.get('user').id, 'all')))
  .post('/:id/open', validate('param', z.object({ id: idOf('lootBox') })), async (c) =>
    c.json(await openBoxes(c.get('user').id, [c.req.valid('param').id])),
  );

export const collectionRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** What the user owns (the catalogue itself is static, in the shared package). */
  .get('/', async (c) => c.json(await collectionView(c.get('user').id)));
