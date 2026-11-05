import { setupSchema } from '@strekatron/shared/schemas';
import { Hono } from 'hono';
import { validate } from '../http/validate';
import { createOwner } from '../services/setup';
import { hasAnyUser } from '../services/users';

export const setupRoutes = new Hono()
  .get('/setup', async (c) => c.json({ needsSetup: !(await hasAnyUser()) }))
  .post('/setup', validate('json', setupSchema), async (c) =>
    createOwner(c.req.valid('json'), c.req.raw.headers),
  );
