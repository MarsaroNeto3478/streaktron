// Better Auth: email + password, sessions in Postgres. Sign-up is closed once the first user exists
// (the owner); it opens behind invites in the social phase.

import { newId, type IdKind } from '@strekatron/shared/ids';
import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client';
import * as schema from '../db/schema';
import { env } from '../env';
import { hasAnyUser } from '../services/users';

const ID_KIND: Record<string, IdKind> = {
  user: 'user',
  session: 'session',
  account: 'account',
  verification: 'verification',
};

export const auth = betterAuth({
  appName: 'Strekatron',
  secret: env.BETTER_AUTH_SECRET,
  basePath: '/api/auth',
  // Opened from localhost, the Vite dev server and the tailnet: each origin is its own base URL.
  baseURL: {
    allowedHosts: env.APP_ORIGINS.map((o) => new URL(o).host),
    fallback: env.APP_ORIGINS[0],
  },
  trustedOrigins: env.APP_ORIGINS,
  database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refreshed once a day of use
  },
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          if (await hasAnyUser()) {
            throw new APIError('FORBIDDEN', { message: 'Sign-up is closed.' });
          }
        },
        after: async (user) => {
          await db.insert(schema.userSettings).values({ userId: user.id }).onConflictDoNothing();
        },
      },
    },
  },
  advanced: {
    // Behind `tailscale serve` or the Vite proxy, which set X-Forwarded-Host/Proto. The server
    // listens on 127.0.0.1 only, so nothing else can send those headers.
    trustedProxyHeaders: true,
    // Client IPs for rate limiting, as the proxy forwards them.
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    database: {
      generateId: ({ model }) => {
        const kind = ID_KIND[model];
        if (!kind)
          throw new Error(`No id prefix for auth model "${model}" (add it to ID_PREFIXES)`);
        return newId(kind);
      },
    },
  },
  telemetry: { enabled: false },
});

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
export type AuthUser = AuthSession['user'];
