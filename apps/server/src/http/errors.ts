// One error shape for every failed request: `{ error: { code, message, details? } }`.

import type { ApiErrorBody } from '@strekatron/shared/schemas';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const errorBody = (code: string, message: string, details?: unknown): ApiErrorBody => ({
  error: details === undefined ? { code, message } : { code, message, details },
});

export function onError(err: Error, c: Context) {
  if (err instanceof HttpError) {
    return c.json(errorBody(err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException) {
    return c.json(errorBody('http_error', err.message || 'Request failed.'), err.status);
  }
  console.error(`[http] ${c.req.method} ${c.req.path} failed`, err);
  return c.json(errorBody('internal', 'Something went wrong on the server.'), 500);
}
