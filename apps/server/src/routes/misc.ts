// Search, mentions (resolve, backlinks), deleted-item snapshots and settings.

import {
  DAY_SETTINGS_LOCK_DAYS,
  idOf,
  linkableId,
  resolveQuerySchema,
  searchQuerySchema,
  settingsPatchSchema,
} from '@strekatron/shared/schemas';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client';
import { userSettings } from '../db/schema';
import { challengeTuning } from '../services/tutorial';
import { HttpError } from '../http/errors';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { backlinks, resolveEntities } from '../services/entities';
import { search } from '../services/search';
import { listSnapshots, restoreSnapshot } from '../services/snapshots';

export const searchRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', validate('query', searchQuerySchema), async (c) => {
    const { q, limit, types } = c.req.valid('query');
    return c.json({ results: await search(c.get('user').id, q, limit, types) });
  });

export const entityRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** Current titles and state for mention chips; unknown ids are left out (broken links). */
  .get('/resolve', validate('query', resolveQuerySchema), async (c) =>
    c.json({ entities: await resolveEntities(c.get('user').id, c.req.valid('query').ids) }),
  )
  /** What mentions this entity. */
  .get('/:id/backlinks', validate('param', z.object({ id: linkableId })), async (c) =>
    c.json({ backlinks: await backlinks(c.get('user').id, c.req.valid('param').id) }),
  );

export const snapshotRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', async (c) => c.json({ snapshots: await listSnapshots(c.get('user').id) }))
  .post('/:id/restore', validate('param', z.object({ id: idOf('snapshot') })), async (c) =>
    c.json(await restoreSnapshot(c.get('user').id, c.req.valid('param').id)),
  );

export const settingsRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .patch('/', validate('json', settingsPatchSchema), async (c) => {
    const patch = c.req.valid('json');
    const userId = c.get('user').id;
    const row = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .for('update');
      if (!current) throw new HttpError(404, 'not_found', 'Your settings are missing.');
      const values: Partial<typeof userSettings.$inferInsert> = {
        ...patch,
        ...challengeTuning(current, patch.challenge, patch.activeProjectLimit),
      };
      // The day's boundaries can move once a week, so days can't be farmed (D17). The first change
      // after setup is free.
      const movesDay =
        (patch.timezone !== undefined && patch.timezone !== current.timezone) ||
        (patch.dayStartHour !== undefined && patch.dayStartHour !== current.dayStartHour);
      if (movesDay) {
        const last = current.timezoneChangedAt;
        const until = last && new Date(last.getTime() + DAY_SETTINGS_LOCK_DAYS * 86_400_000);
        if (until && until > new Date()) {
          throw new HttpError(
            409,
            'day_settings_locked',
            `Your time zone and day start can change once a week. Next change: ${until.toDateString()}.`,
            { until },
          );
        }
        values.timezoneChangedAt = new Date();
      }
      if (!Object.keys(values).length) return current;
      const [next] = await tx
        .update(userSettings)
        .set(values)
        .where(eq(userSettings.userId, userId))
        .returning();
      return next!;
    });
    const { userId: _, createdAt: __, updatedAt: ___, ...settings } = row;
    return c.json(settings);
  });
