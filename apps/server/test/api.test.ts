import { isId } from '@strekatron/shared/ids';
import { userDay } from '@strekatron/shared/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth } from '../src/auth';
import { db } from '../src/db/client';
import { users, userSettings } from '../src/db/schema';
import { cookiesFrom, owner, request, resetDb, setUpOwner } from './helpers';

beforeEach(resetDb);

describe('health', () => {
  it('reports the database up', async () => {
    const res = await request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: 'up' });
  });
});

describe('unknown endpoints', () => {
  it('answer 404 in the API error shape', async () => {
    const res = await request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'No such endpoint: /api/nope' },
    });
  });
});

describe('first-run setup', () => {
  it('is needed until the first account exists', async () => {
    expect(await (await request('/api/setup')).json()).toEqual({ needsSetup: true });
    await setUpOwner();
    expect(await (await request('/api/setup')).json()).toEqual({ needsSetup: false });
  });

  it('makes the owner, signs them in and stores their time zone', async () => {
    const res = await request('/api/setup', { body: owner });
    expect(res.status).toBe(200);
    const cookie = cookiesFrom(res);
    expect(cookie).toContain('session_token');

    const me = await request('/api/me', { cookie });
    expect(me.status).toBe(200);
    const body = (await me.json()) as {
      user: { id: string; email: string };
      settings: { timezone: string; dayStartHour: number; activeProjectLimit: number };
      today: string;
    };
    expect(isId(body.user.id, 'user')).toBe(true);
    expect(body.user.email).toBe(owner.email);
    expect(body.settings).toMatchObject({
      timezone: 'America/Sao_Paulo',
      dayStartHour: 4,
      activeProjectLimit: 3,
    });
    expect(body.today).toBe(
      userDay(new Date(), { timeZone: 'America/Sao_Paulo', dayStartHour: 4 }),
    );
  });

  it('rejects invalid input with each field named', async () => {
    const res = await request('/api/setup', {
      body: { ...owner, email: 'not-an-email', password: 'short', timezone: 'Nowhere/Land' },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.details.map((d) => d.path).sort()).toEqual(['email', 'password', 'timezone']);
  });

  it('only works once', async () => {
    await setUpOwner();
    const res = await request('/api/setup', { body: { ...owner, email: 'eve@example.com' } });
    expect(res.status).toBe(409);
    expect(await db.$count(users)).toBe(1);
  });
});

describe('sign-up is closed', () => {
  it('through the public endpoint, even before setup', async () => {
    const res = await request('/api/auth/sign-up/email', {
      body: { name: 'Eve', email: 'eve@example.com', password: 'password123' },
    });
    expect(res.status).toBe(403);
    expect(await db.$count(users)).toBe(0);
  });

  it('inside Better Auth once an account exists', async () => {
    await setUpOwner();
    await expect(
      auth.api.signUpEmail({
        body: { name: 'Eve', email: 'eve@example.com', password: 'password123' },
      }),
    ).rejects.toThrow(/closed/i);
    expect(await db.$count(users)).toBe(1);
  });
});

describe('sessions', () => {
  it('signs in, reads /me, signs out', async () => {
    await setUpOwner();
    const signIn = await request('/api/auth/sign-in/email', {
      body: { email: owner.email, password: owner.password },
    });
    expect(signIn.status).toBe(200);
    const cookie = cookiesFrom(signIn);
    expect((await request('/api/me', { cookie })).status).toBe(200);

    const signOut = await request('/api/auth/sign-out', { method: 'POST', cookie, body: {} });
    expect(signOut.status).toBe(200);
    expect((await request('/api/me', { cookie })).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    await setUpOwner();
    const res = await request('/api/auth/sign-in/email', {
      body: { email: owner.email, password: 'wrong password' },
    });
    expect(res.status).toBe(401);
  });

  it('answers 401 without a session', async () => {
    const res = await request('/api/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: 'Sign in to continue.' },
    });
  });
});

describe('user settings', () => {
  it('are made with every account and go with it', async () => {
    await setUpOwner();
    const [user] = await db.select().from(users);
    expect(await db.$count(userSettings, eq(userSettings.userId, user!.id))).toBe(1);
    await db.delete(users).where(eq(users.id, user!.id));
    expect(await db.$count(userSettings)).toBe(0);
  });
});
