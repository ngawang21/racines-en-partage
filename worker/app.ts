// The Hono API on /api/* (spec 6.3). Every dependency is injected so the tests
// run the real handlers against a fake Stripe, a fake mailer and a fixture catalogue.
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import pkg from '../package.json';
import type { WorkerCatalog } from './catalog';
import {
  MAX_BODY_BYTES,
  buildSessionParams,
  isAllowedOrigin,
  parseCheckoutRequest,
} from './checkout';
import { ApiError, errorBody, handleError, notFound } from './errors';
import { describeError, logError } from './log';
import { assertSessionId, isResourceMissing, publicOrder, summariseSession } from './orders';
import type { AppEnv, Mailer, StripeLike } from './types';
import { MAX_WEBHOOK_BYTES, handleEvent, verifyEvent } from './webhook';

export type { AppEnv, Mailer, StripeLike } from './types';

export interface AppDeps {
  stripe: StripeLike;
  mailer: Mailer;
  loadCatalog: () => Promise<WorkerCatalog>;
  env: AppEnv;
  now: () => Date;
}

export const API_VERSION: string = pkg.version;

/** Headers on every API response, errors and 404s included. */
const apiHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.res.headers.set('Cache-Control', 'no-store');
  c.res.headers.set('Content-Type', 'application/json; charset=utf-8');
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
};

const limit = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: () => {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Body larger than ${maxSize} bytes`);
    },
  });

function methodNotAllowed(allow: string) {
  return (c: Context) => {
    c.header('Allow', allow);
    return c.json(errorBody('METHOD_NOT_ALLOWED', `Use ${allow}`), 405);
  };
}

export function createApp(deps: AppDeps) {
  const { env } = deps;
  const app = new Hono();

  async function catalog(): Promise<WorkerCatalog> {
    try {
      return await deps.loadCatalog();
    } catch (err) {
      logError('catalog.unavailable', { error: describeError(err) });
      throw new ApiError(503, 'CATALOG_UNAVAILABLE', 'Catalogue unavailable, try again shortly');
    }
  }

  app.use('/api/*', apiHeaders);

  app.get('/api/health', async (c) => {
    const { generatedAt } = await catalog();
    return c.json({ ok: true, version: API_VERSION, catalogGeneratedAt: generatedAt });
  });

  app.post('/api/checkout', limit(MAX_BODY_BYTES), async (c) => {
    if (!isAllowedOrigin(c.req.raw, env.SITE_URL)) {
      throw new ApiError(403, 'FORBIDDEN_ORIGIN', 'Cross-origin request refused');
    }
    const type = c.req.header('content-type');
    if (type && !/^application\/json\s*(;|$)/i.test(type)) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send application/json');
    }
    let body: unknown;
    try {
      body = JSON.parse(await c.req.text());
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Body is not valid JSON');
    }
    const request = parseCheckoutRequest(body);
    const params = buildSessionParams(request, await catalog(), env, deps.now());

    let url: string | null;
    try {
      url = (await deps.stripe.checkout.sessions.create(params)).url;
    } catch (err) {
      logError('checkout.stripe_failed', { error: describeError(err) });
      throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
    }
    if (!url) {
      logError('checkout.stripe_failed', { error: 'session without url' });
      throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
    }
    return c.json({ url });
  });

  app.get('/api/orders/:sessionId', async (c) => {
    const id = c.req.param('sessionId');
    assertSessionId(id);
    let summary;
    try {
      summary = summariseSession(
        await deps.stripe.checkout.sessions.retrieve(id, {
          expand: ['line_items', 'shipping_cost.shipping_rate'],
        }),
      );
    } catch (err) {
      if (isResourceMissing(err)) throw new ApiError(404, 'NOT_FOUND', 'No such order');
      logError('orders.stripe_failed', { error: describeError(err) });
      throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
    }
    if (!summary.delivery) throw new ApiError(404, 'NOT_FOUND', 'No such order');
    return c.json(publicOrder(summary));
  });

  app.post('/api/webhooks/stripe', limit(MAX_WEBHOOK_BYTES), async (c) => {
    const payload = await c.req.text();
    const event = await verifyEvent(
      deps.stripe,
      payload,
      c.req.header('stripe-signature'),
      env.STRIPE_WEBHOOK_SECRET,
    );
    await handleEvent(event, deps);
    return c.json({ received: true });
  });

  app.all('/api/health', methodNotAllowed('GET'));
  app.all('/api/checkout', methodNotAllowed('POST'));
  app.all('/api/orders/:sessionId', methodNotAllowed('GET'));
  app.all('/api/webhooks/stripe', methodNotAllowed('POST'));

  app.notFound(notFound);
  app.onError(handleError);
  return app;
}
