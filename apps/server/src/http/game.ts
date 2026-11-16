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
import { HttpError } from './errors';

const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** How old a write made offline may be when it arrives (D55). */
export const OFFLINE_MAX_AGE_MS = 7 * 24 * 3600_000;

/**
 * `X-Occurred-At`: a write made offline says when it was made (D55). In the future (a clock a bit
 * ahead) counts as now; older than a week is refused, so the log can't be rewritten far back.
 */
export function occurredAt(header: string | undefined, now = new Date()): Date | null {
  if (!header) return null;
  const at = new Date(header);
  if (Number.isNaN(at.getTime())) {
    throw new HttpError(400, 'invalid_occurred_at', 'X-Occurred-At must be a date and time.');
  }
  if (at > now) return null;
  if (now.getTime() - at.getTime() > OFFLINE_MAX_AGE_MS) {
    throw new HttpError(
      400,
      'offline_too_old',
      'This change was made offline more than a week ago, so it wasn’t applied.',
    );
  }
  return at;
}

export const gameEvents = createMiddleware(async (c, next) => {
  if (!WRITES.has(c.req.method)) return next();
  const at = occurredAt(c.req.header('x-occurred-at'));
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
  }, at);
});
