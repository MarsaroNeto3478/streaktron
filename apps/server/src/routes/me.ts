import { userDay } from '@strekatron/shared/time';
import { Hono } from 'hono';
import { HttpError } from '../http/errors';
import { requireUser, type AuthedEnv } from '../http/session';
import { getSettings } from '../services/users';

export const meRoutes = new Hono<AuthedEnv>().get('/me', requireUser, async (c) => {
  const user = c.get('user');
  const settings = await getSettings(user.id);
  if (!settings) throw new HttpError(500, 'missing_settings', 'Your settings are missing.');
  const { userId: _, createdAt: __, updatedAt: ___, ...rest } = settings;
  return c.json({
    user: { id: user.id, name: user.name, email: user.email },
    settings: rest,
    // The user's day, decided here and not by the client's clock (D17).
    today: userDay(new Date(), {
      timeZone: settings.timezone,
      dayStartHour: settings.dayStartHour,
    }),
  });
});
