// The `game` block on write responses (plan.md §4.5). Writes record activity as they commit; this
// middleware then evaluates quests and adds what happened (XP, level up, quests done…) to the JSON
// body, so the UI can celebrate at once without polling.
//
// Game evaluation never fails a committed write (Quire's SRV-4): an error is logged, a retry job is
// queued, and the response goes out without the block.

import { createMiddleware } from 'hono/factory';
import { QUEUES } from '../jobs/names';
import { enqueue } from '../jobs/queue';
import { withGameScope } from '../services/activity';
import { evaluateAfterWrite } from '../services/game';

const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export const gameEvents = createMiddleware(async (c, next) => {
  if (!WRITES.has(c.req.method)) return next();
  await withGameScope(async (scope) => {
    await next();
    if (!scope.userId || (!scope.activities.length && !scope.touched.size)) return;
    if (c.res.status >= 400) return;
    if (!c.res.headers.get('content-type')?.includes('application/json')) return;

    let game;
    try {
      game = await evaluateAfterWrite(scope);
    } catch (err) {
      console.error('[game] evaluation failed; queued a retry', err);
      void enqueue(QUEUES.game, { userId: scope.userId }).catch(() => {});
      return;
    }
    if (!game) return;
    const body = await c.res.clone().json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return;
    const headers = new Headers(c.res.headers);
    headers.delete('content-length');
    c.res = new Response(JSON.stringify({ ...body, game }), { status: c.res.status, headers });
  });
});
