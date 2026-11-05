// Streaky's tour and question (D31, D32).

import { challengeAnswerSchema } from '@streaktron/shared/schemas';
import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import {
  answerChallenge,
  closeTutorial,
  getTutorial,
  skipStep,
  startTutorial,
} from '../services/tutorial';

export const tutorialRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json(await getTutorial(c.get('user').id)))
  .post('/start', async (c) => c.json(await startTutorial(c.get('user').id)))
  .post('/challenge', validate('json', challengeAnswerSchema), async (c) =>
    c.json(await answerChallenge(c.get('user').id, c.req.valid('json').challenge)),
  )
  .post('/skip', async (c) => c.json(await skipStep(c.get('user').id)))
  .post('/close', async (c) => c.json(await closeTutorial(c.get('user').id)));
