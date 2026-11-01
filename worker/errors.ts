// Uniform error bodies: `{ "error": { "code", "message", "details?" } }` (spec 6.3).
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { describeError, logError } from './log';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN_ORIGIN'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNKNOWN_SKU'
  | 'OUT_OF_STOCK'
  | 'SHIPPING_UNAVAILABLE'
  | 'SHOP_CLOSED'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INVALID_SIGNATURE'
  | 'CATALOG_UNAVAILABLE'
  | 'EMAIL_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export type ErrorDetails = Record<string, unknown>;

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetails };
}

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorBody(code: ErrorCode, message: string, details?: ErrorDetails): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** Hono `onError`: known errors keep their status, anything else is a logged 500. */
export function handleError(err: Error, c: Context): Response {
  if (err instanceof ApiError) {
    return c.json(errorBody(err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException) {
    const status = err.status;
    if (status === 413) return c.json(errorBody('PAYLOAD_TOO_LARGE', 'Body too large'), 413);
    return c.json(errorBody('VALIDATION_ERROR', 'Bad request'), 400);
  }
  logError('api.unhandled', { path: c.req.path, error: describeError(err) });
  return c.json(errorBody('INTERNAL_ERROR', 'Internal error'), 500);
}

export function notFound(c: Context): Response {
  return c.json(errorBody('NOT_FOUND', 'No such endpoint'), 404);
}
