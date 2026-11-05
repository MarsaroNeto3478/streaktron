// First run: making the owner's account. The only way an account is made until sign-up opens.

import type { SetupInput } from '@strekatron/shared/schemas';
import { eq } from 'drizzle-orm';
import { auth } from '../auth';
import { db } from '../db/client';
import { userSettings } from '../db/schema';
import { HttpError } from '../http/errors';
import { hasAnyUser } from './users';

/**
 * Make the first account and sign it in. Returns Better Auth's response (with the session cookie).
 * The time zone comes from the browser, so the very first day already counts in the right place.
 */
export async function createOwner(input: SetupInput, headers: Headers): Promise<Response> {
  if (await hasAnyUser()) throw new HttpError(409, 'setup_done', 'This app is already set up.');
  const res = await auth.api.signUpEmail({
    body: { name: input.name, email: input.email, password: input.password },
    headers,
    asResponse: true,
  });
  if (!res.ok) return res;
  const { user } = (await res.clone().json()) as { user: { id: string } };
  await db
    .update(userSettings)
    .set({ timezone: input.timezone })
    .where(eq(userSettings.userId, user.id));
  return res;
}
