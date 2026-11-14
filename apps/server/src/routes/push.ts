// Web Push (D45): the server's public key, this device's subscription, and a test push.

import { pushSubscriptionSchema, pushUnsubscribeSchema } from '@strekatron/shared/push';
import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { deviceCount, sendTest, subscribe, unsubscribe, vapidKeys } from '../services/push';

export const pushRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** The key the browser needs to subscribe, and how many devices are on. */
  .get('/', async (c) =>
    c.json({ publicKey: vapidKeys().publicKey, devices: await deviceCount(c.get('user').id) }),
  )
  .post('/subscriptions', validate('json', pushSubscriptionSchema), async (c) =>
    c.json(await subscribe(c.get('user').id, c.req.valid('json'), c.req.header('user-agent')), 201),
  )
  .post('/subscriptions/remove', validate('json', pushUnsubscribeSchema), async (c) =>
    c.json(await unsubscribe(c.get('user').id, c.req.valid('json').endpoint)),
  )
  .post('/test', async (c) => c.json(await sendTest(c.get('user').id)));
