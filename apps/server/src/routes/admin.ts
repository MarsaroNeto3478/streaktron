import { Hono } from 'hono';
import { requireUser, type AuthedEnv } from '../http/session';
import { runBackup } from '../jobs/backup';
import { evaluateAll } from '../services/game';

export const adminRoutes = new Hono<AuthedEnv>()
  .post('/admin/backup', requireUser, async (c) => {
    const result = await runBackup({ force: true });
    return c.json(result);
  })
  /**
   * XP, levels and streaks are always computed from the activity log, so there's nothing cached to
   * rebuild: recompute re-evaluates every open quest and returns the state as the log has it.
   */
  .post('/admin/recompute', requireUser, async (c) => {
    const { state, events } = await evaluateAll(c.get('user').id);
    return c.json({ state, questsDone: events?.questsDone ?? [] });
  });
