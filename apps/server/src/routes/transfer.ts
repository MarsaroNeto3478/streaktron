// Export and import (D51).

import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser, type AuthedEnv } from '../http/session';
import { validate } from '../http/validate';
import { exportAccount, importAccount, type ExportFile } from '../services/transfer';

const fileSchema = z.object({
  format: z.string(),
  version: z.number(),
  exportedAt: z.string(),
  user: z.object({ name: z.string(), email: z.string() }).optional(),
  settings: z.record(z.string(), z.unknown()),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export const transferRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  /** Everything the account has, as one JSON file. */
  .get('/export', async (c) => c.json(await exportAccount(c.get('user').id)))
  /** Replace the account's data with an export's (a copy of the old data is kept on the server). */
  .post('/import', validate('json', fileSchema), async (c) =>
    c.json(await importAccount(c.get('user').id, c.req.valid('json') as ExportFile)),
  );
