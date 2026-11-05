// The weekly review (D38).

import { reviewCompleteSchema } from '@streaktron/shared/schemas';
import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { completeReview, currentReview, listReviews } from '../services/reviews';

export const reviewRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** Past reviews, newest first. */
  .get('/', async (c) => c.json({ reviews: await listReviews(c.get('user').id) }))
  /** This week's: due or done, the last seven days, what stalled. */
  .get('/current', async (c) => c.json(await currentReview(c.get('user').id)))
  .post('/complete', validate('json', reviewCompleteSchema), async (c) =>
    c.json(await completeReview(c.get('user').id, c.req.valid('json')), 201),
  );
