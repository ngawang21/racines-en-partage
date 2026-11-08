// The Hono API on /api/* (spec 6.3). Every dependency is injected so the tests
// run the real handlers against a fake Stripe, a fake mailer and a fixture catalogue.
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import pkg from '../package.json';
import type { WorkerCatalog } from './catalog';
import {
  MAX_BODY_BYTES,
  buildSessionParams,
  isAllowedOrigin,
  parseCheckoutRequest,
} from './checkout';
import {
  accountOrders,
  accountReviewToken,
  handleLogin,
  openSession,
  sessionEmail,
} from './account';
import type { FormsBudget } from './budget';
import { clearedSessionCookie, sessionCookie } from './cookies';
import { ApiError, errorBody, handleError, notFound } from './errors';
import {
  MAX_FORM_BYTES,
  confirmNewsletter,
  emailField,
  handleContact,
  handleNewsletter,
  parseBody,
} from './forms';
import { describeError, logError } from './log';
import {
  SESSION_EXPAND,
  assertSessionId,
  deliveryFromMetadata,
  findOrderByNumber,
  isOrderExpired,
  isResourceMissing,
  publicOrder,
  summariseSession,
  withLineItems,
} from './orders';
import { submitReview } from './reviews';
import type {
  AppEnv,
  Audience,
  Captcha,
  Mailer,
  RateLimiter,
  ReviewRepo,
  StripeLike,
} from './types';
import { MAX_WEBHOOK_BYTES, handleEvent, verifyEvent } from './webhook';

export type { AppEnv, Mailer, RateLimiter, StripeLike } from './types';

export interface AppDeps {
  stripe: StripeLike;
  mailer: Mailer;
  loadCatalog: () => Promise<WorkerCatalog>;
  env: AppEnv;
  now: () => Date;
  /** Workers rate limiting bindings; a missing one means no limit (tests, old wrangler). */
  limiters?: { checkout?: RateLimiter; orders?: RateLimiter; forms?: RateLimiter };
  /**
   * Turnstile check of the contact and newsletter forms. Absent: no check
   * (tests, `FORMS_ALLOW_WITHOUT_CAPTCHA`). Null: no secret in production,
   * so those forms answer 404 FEATURE_DISABLED.
   */
  captcha?: Captcha | null;
  /** Daily budget of form-triggered e-mails (KV); absent means no budget. */
  budget?: FormsBudget;
  /** Newsletter contacts; absent disables the newsletter endpoints (404 FEATURE_DISABLED). */
  audience?: Audience;
  /** Where reviews are committed; absent disables POST /api/reviews (404 FEATURE_DISABLED). */
  reviewRepo?: ReviewRepo;
}

const lookupRequestSchema = z.object({
  number: z.string().trim().min(1).max(64),
  email: emailField,
});

/** Seconds a rate-limited client is asked to wait (the limiter period). */
export const RETRY_AFTER_SECONDS = 60;
/** Key shared by requests without CF-Connecting-IP (never the case behind Cloudflare). */
const ANONYMOUS_KEY = 'no-ip';

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

/** Per-IP limit through a Workers rate limiting binding; skipped when the binding is absent. */
function rateLimit(name: string, limiter: RateLimiter | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (limiter) {
      const key = c.req.header('cf-connecting-ip') || ANONYMOUS_KEY;
      let success = true;
      try {
        ({ success } = await limiter.limit({ key }));
      } catch (err) {
        // A limiter outage must not close the shop: let the request through.
        logError('ratelimit.failed', { limiter: name, error: describeError(err) });
      }
      if (!success) {
        return c.json(errorBody('RATE_LIMITED', 'Too many requests, try again in a minute'), 429, {
          'Retry-After': String(RETRY_AFTER_SECONDS),
        });
      }
    }
    await next();
  };
}

/** Same-origin JSON body of a POST: 403, 415 or 400 otherwise. */
async function readJson(c: Context, siteUrl: string): Promise<unknown> {
  if (!isAllowedOrigin(c.req.raw, siteUrl)) {
    throw new ApiError(403, 'FORBIDDEN_ORIGIN', 'Cross-origin request refused');
  }
  const type = c.req.header('content-type');
  if (type && !/^application\/json\s*(;|$)/i.test(type)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send application/json');
  }
  try {
    return JSON.parse(await c.req.text());
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Body is not valid JSON');
  }
}

const clientIp = (c: Context) => c.req.header('cf-connecting-ip') ?? null;

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

  app.post(
    '/api/checkout',
    rateLimit('checkout', deps.limiters?.checkout),
    limit(MAX_BODY_BYTES),
    async (c) => {
      const request = parseCheckoutRequest(await readJson(c, env.SITE_URL));
      const params = buildSessionParams(request, await catalog(), env, deps.now(), c.req.url);

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
    },
  );

  // Registered before GET /api/orders/:sessionId, which would otherwise take "lookup" as an id.
  app.post(
    '/api/orders/lookup',
    rateLimit('orders', deps.limiters?.orders),
    limit(MAX_FORM_BYTES),
    async (c) => {
      const req = parseBody(lookupRequestSchema, await readJson(c, env.SITE_URL), 'lookup');
      const missing = () => new ApiError(404, 'ORDER_NOT_FOUND', 'No order matches');
      let session;
      try {
        session = await findOrderByNumber(deps.stripe, req.number, req.email);
        if (!session) throw missing();
        session = await withLineItems(deps.stripe, session);
      } catch (err) {
        if (err instanceof ApiError) throw err;
        logError('orders.stripe_failed', { error: describeError(err) });
        throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
      }
      return c.json(publicOrder(summariseSession(session)));
    },
  );
  app.all('/api/orders/lookup', methodNotAllowed('POST'));

  app.get('/api/orders/:sessionId', rateLimit('orders', deps.limiters?.orders), async (c) => {
    const id = c.req.param('sessionId');
    assertSessionId(id);
    const notFound = () => new ApiError(404, 'NOT_FOUND', 'No such order');
    const providerError = (err: unknown) => {
      if (isResourceMissing(err)) return notFound();
      logError('orders.stripe_failed', { error: describeError(err) });
      return new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider unavailable');
    };
    let session;
    try {
      session = await deps.stripe.checkout.sessions.retrieve(id, { expand: SESSION_EXPAND });
    } catch (err) {
      throw providerError(err);
    }
    // Not created by this shop, or too old for the thanks page.
    if (!deliveryFromMetadata(session.metadata)) throw notFound();
    if (isOrderExpired(session, deps.now())) throw notFound();
    try {
      session = await withLineItems(deps.stripe, session);
    } catch (err) {
      throw providerError(err);
    }
    return c.json(publicOrder(summariseSession(session)));
  });

  app.post('/api/webhooks/stripe', limit(MAX_WEBHOOK_BYTES), async (c) => {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      // Stripe only sees a 400; this line tells the Worker logs why.
      logError('config.missing', {
        name: 'STRIPE_WEBHOOK_SECRET',
        consequence:
          'every Stripe event is refused (400 INVALID_SIGNATURE) and no order e-mail goes out',
      });
    }
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

  const forms = rateLimit('forms', deps.limiters?.forms);

  app.post('/api/contact', forms, limit(MAX_FORM_BYTES), async (c) => {
    const body = await readJson(c, env.SITE_URL);
    await handleContact(body, deps, clientIp(c), async (sku) => {
      const product = (await catalog()).products.find((p) => p.sku === sku);
      return product ? product.name.fr : null;
    });
    return c.json({ ok: true }, 202);
  });

  app.post('/api/newsletter', forms, limit(MAX_FORM_BYTES), async (c) => {
    await handleNewsletter(await readJson(c, env.SITE_URL), deps, clientIp(c), catalog);
    return c.json({ ok: true }, 202);
  });

  // Posted by the static newsletter page; it sends no e-mail, so no budget.
  app.post('/api/newsletter/confirm', forms, limit(MAX_FORM_BYTES), async (c) => {
    await confirmNewsletter(await readJson(c, env.SITE_URL), deps, catalog);
    return c.json({ ok: true });
  });

  app.post('/api/reviews', forms, limit(MAX_FORM_BYTES), async (c) => {
    await submitReview(await readJson(c, env.SITE_URL), deps, catalog);
    return c.json({ ok: true }, 201);
  });

  // Customer space (spec 8.6): sign-in link, session cookie, orders, review tokens.
  const orders = rateLimit('orders', deps.limiters?.orders);

  app.post('/api/account/login', forms, limit(MAX_FORM_BYTES), async (c) => {
    await handleLogin(await readJson(c, env.SITE_URL), deps, clientIp(c));
    return c.json({ ok: true }, 202);
  });

  app.post('/api/account/session', forms, limit(MAX_FORM_BYTES), async (c) => {
    const { cookieToken, email } = await openSession(await readJson(c, env.SITE_URL), deps);
    c.header('Set-Cookie', sessionCookie(cookieToken, env.SITE_URL));
    return c.json({ ok: true, email });
  });

  app.get('/api/account/orders', orders, async (c) => {
    const email = await sessionEmail(c.req.header('cookie'), deps);
    return c.json(await accountOrders(email, deps, catalog));
  });

  app.post('/api/account/review-token', orders, limit(MAX_FORM_BYTES), async (c) => {
    const body = await readJson(c, env.SITE_URL);
    const email = await sessionEmail(c.req.header('cookie'), deps);
    return c.json({ token: await accountReviewToken(body, email, deps, catalog) });
  });

  app.post('/api/account/logout', limit(MAX_FORM_BYTES), async (c) => {
    if (!isAllowedOrigin(c.req.raw, env.SITE_URL)) {
      throw new ApiError(403, 'FORBIDDEN_ORIGIN', 'Cross-origin request refused');
    }
    c.header('Set-Cookie', clearedSessionCookie(env.SITE_URL));
    return c.json({ ok: true });
  });

  app.all('/api/account/login', methodNotAllowed('POST'));
  app.all('/api/account/session', methodNotAllowed('POST'));
  app.all('/api/account/orders', methodNotAllowed('GET'));
  app.all('/api/account/review-token', methodNotAllowed('POST'));
  app.all('/api/account/logout', methodNotAllowed('POST'));
  app.all('/api/contact', methodNotAllowed('POST'));
  app.all('/api/newsletter', methodNotAllowed('POST'));
  app.all('/api/newsletter/confirm', methodNotAllowed('POST'));
  app.all('/api/reviews', methodNotAllowed('POST'));
  app.all('/api/health', methodNotAllowed('GET'));
  app.all('/api/checkout', methodNotAllowed('POST'));
  app.all('/api/orders/:sessionId', methodNotAllowed('GET'));
  app.all('/api/webhooks/stripe', methodNotAllowed('POST'));

  app.notFound(notFound);
  app.onError(handleError);
  return app;
}
