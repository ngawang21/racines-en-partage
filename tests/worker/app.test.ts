import { parse } from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import shopYml from '../../src/content/settings/shop.yml?raw';
import pkg from '../../package.json';
import worker from '../../worker/index';
import { SHOP } from '../../worker/shop';
import type { Env } from '../../worker/types';
import {
  SAME_ORIGIN,
  SESSION_ID,
  catalogFixture,
  fakeLimiter,
  makeApp,
  postJson,
  type ErrorJson,
} from './fixtures';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('API surface', () => {
  it('GET /api/health reports the version and the catalogue date', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      version: pkg.version,
      catalogGeneratedAt: '2026-11-01T17:43:53.780Z',
    });
  });

  it('every API response carries no-store, JSON with charset and nosniff (errors too)', async () => {
    const { app } = makeApp();
    for (const res of [
      await app.request('/api/health'),
      await app.request('/api/nope'),
      await app.request('/api/checkout'),
      await app.request('/api/orders/bad'),
    ]) {
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  it('404 NOT_FOUND JSON for an unknown /api path', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/unknown/thing');
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorJson).error).toEqual({
      code: 'NOT_FOUND',
      message: 'No such endpoint',
    });
  });

  it.each([
    ['GET', '/api/checkout', 'POST'],
    ['PUT', '/api/checkout', 'POST'],
    ['POST', '/api/health', 'GET'],
    ['DELETE', '/api/orders/cs_test_abc', 'GET'],
    ['GET', '/api/webhooks/stripe', 'POST'],
    ['GET', '/api/contact', 'POST'],
    ['GET', '/api/newsletter', 'POST'],
    ['GET', '/api/reviews', 'POST'],
    ['GET', '/api/orders/lookup', 'POST'],
  ])('405 METHOD_NOT_ALLOWED for %s %s', async (method, path, allow) => {
    const { app } = makeApp();
    const res = await app.request(path, { method });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe(allow);
    expect(((await res.json()) as ErrorJson).error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('500 INTERNAL_ERROR hides unexpected exceptions', async () => {
    const { app } = makeApp({
      now: () => {
        throw new Error('clock exploded with sk_live_x');
      },
    });
    const res = await app.request('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://racinesenpartage.fr' },
      body: JSON.stringify({
        locale: 'fr',
        items: [{ sku: 'REP-MOR-100', quantity: 1 }],
        delivery: { method: 'pickup' },
        acceptedTerms: true,
      }),
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('INTERNAL_ERROR');
    expect(text).not.toContain('sk_live');
  });
});

describe('rate limiting', () => {
  const checkoutBody = {
    locale: 'fr',
    items: [{ sku: 'REP-MOR-100', quantity: 1 }],
    delivery: { method: 'pickup' },
    acceptedTerms: true,
  };

  it('checkout: keyed on CF-Connecting-IP, 429 RATE_LIMITED with Retry-After once refused', async () => {
    const checkout = fakeLimiter(1);
    const { app, stripe } = makeApp({ limiters: { checkout: checkout.limiter } });
    const headers = { ...SAME_ORIGIN, 'CF-Connecting-IP': '203.0.113.7' };
    expect((await postJson(app, '/api/checkout', checkoutBody, headers)).status).toBe(200);
    const res = await postJson(app, '/api/checkout', checkoutBody, headers);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(((await res.json()) as ErrorJson).error.code).toBe('RATE_LIMITED');
    expect(checkout.keys).toEqual(['203.0.113.7', '203.0.113.7']);
    expect(stripe.create).toHaveBeenCalledOnce();
  });

  it('orders: its own limiter, Stripe untouched once refused', async () => {
    const orders = fakeLimiter(0);
    const checkout = fakeLimiter();
    const { app, stripe } = makeApp({
      limiters: { checkout: checkout.limiter, orders: orders.limiter },
    });
    const res = await app.request(`/api/orders/${SESSION_ID}`, {
      headers: { 'CF-Connecting-IP': '2001:db8::1' },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(orders.keys).toEqual(['2001:db8::1']);
    expect(checkout.limit).not.toHaveBeenCalled();
    expect(stripe.retrieve).not.toHaveBeenCalled();
  });

  it('falls back on a constant key without CF-Connecting-IP', async () => {
    const checkout = fakeLimiter();
    const { app } = makeApp({ limiters: { checkout: checkout.limiter } });
    await postJson(app, '/api/checkout', checkoutBody);
    expect(checkout.keys).toEqual(['no-ip']);
  });

  it('no binding (tests, older wrangler): no limit', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 15; i++) {
      expect((await postJson(app, '/api/checkout', checkoutBody)).status).toBe(200);
    }
  });

  it('a limiter error lets the request through and is logged', async () => {
    const errors: string[] = [];
    vi.mocked(console.error).mockImplementation((line: string) => void errors.push(line));
    const checkout = fakeLimiter();
    checkout.limit.mockRejectedValueOnce(new Error('limiter down'));
    const { app } = makeApp({ limiters: { checkout: checkout.limiter } });
    expect((await postJson(app, '/api/checkout', checkoutBody)).status).toBe(200);
    expect(errors.some((l) => l.includes('ratelimit.failed'))).toBe(true);
  });

  it('the webhook is never rate limited', async () => {
    const checkout = fakeLimiter(0);
    const orders = fakeLimiter(0);
    const { app } = makeApp({ limiters: { checkout: checkout.limiter, orders: orders.limiter } });
    const res = await app.request('/api/webhooks/stripe', { method: 'POST', body: '{}' });
    expect(res.status).toBe(400);
    expect(checkout.limit).not.toHaveBeenCalled();
    expect(orders.limit).not.toHaveBeenCalled();
  });
});

describe('worker entry (index.ts)', () => {
  function fakeAssets(catalog = catalogFixture()) {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/catalog.json') return Response.json(catalog);
      return new Response(`asset ${url.pathname}`, { status: 200 });
    });
    return { fetch, connect: vi.fn() } as unknown as Fetcher & { fetch: typeof fetch };
  }

  const env = (assets: Fetcher): Env => ({
    ASSETS: assets,
    SITE_URL: 'https://racinesenpartage.fr',
    ORDER_EMAIL_FROM: 'Racines en Partage <commandes@racinesenpartage.fr>',
  });
  const ctx = {} as ExecutionContext;
  /** A plain Request typed as the incoming one (the `cf` object is absent in tests). */
  const workerRequest = (url: string, init?: RequestInit) =>
    new Request(url, init) as unknown as Parameters<typeof worker.fetch>[0];

  it('serves non-API paths from ASSETS', async () => {
    const assets = fakeAssets();
    const res = await worker.fetch(
      workerRequest('https://racinesenpartage.fr/boutique/'),
      env(assets),
      ctx,
    );
    expect(await res.text()).toBe('asset /boutique/');
  });

  it('routes /api/* to the app, which reads /catalog.json through ASSETS on the request origin', async () => {
    const assets = fakeAssets(catalogFixture({ generatedAt: '2026-11-01T20:00:00.000Z' }));
    const res = await worker.fetch(
      workerRequest('http://localhost:8787/api/health'),
      env(assets),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    expect(String(vi.mocked(assets.fetch).mock.calls[0]![0])).toBe(
      'http://localhost:8787/catalog.json',
    );
  });

  it('passes the rate limiting bindings to the app', async () => {
    const checkout = fakeLimiter(0);
    const res = await worker.fetch(
      workerRequest('https://racinesenpartage.fr/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://racinesenpartage.fr',
          'CF-Connecting-IP': '198.51.100.4',
        },
        body: '{}',
      }),
      { ...env(fakeAssets()), CHECKOUT_LIMITER: checkout.limiter },
      ctx,
    );
    expect(res.status).toBe(429);
    expect(checkout.keys).toEqual(['198.51.100.4']);
  });

  it('checkout without STRIPE_SECRET_KEY fails as 502, not as a crash', async () => {
    const res = await worker.fetch(
      workerRequest('https://racinesenpartage.fr/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://racinesenpartage.fr' },
        body: JSON.stringify({
          locale: 'fr',
          items: [{ sku: 'REP-MOR-100', quantity: 1 }],
          delivery: { method: 'pickup' },
          acceptedTerms: true,
        }),
      }),
      env(fakeAssets()),
      ctx,
    );
    expect(res.status).toBe(502);
  });

  it('passes the forms limiter to the app', async () => {
    const forms = fakeLimiter(0);
    const res = await worker.fetch(
      workerRequest('https://racinesenpartage.fr/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://racinesenpartage.fr' },
        body: '{}',
      }),
      { ...env(fakeAssets()), FORMS_LIMITER: forms.limiter },
      ctx,
    );
    expect(res.status).toBe(429);
  });

  it('without RESEND_AUDIENCE_ID, GITHUB_TOKEN or FORMS_SECRET the features answer 404 FEATURE_DISABLED', async () => {
    const post = (path: string) =>
      worker.fetch(
        workerRequest(`https://racinesenpartage.fr${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://racinesenpartage.fr' },
          body: JSON.stringify({ email: 'a@example.com', locale: 'fr' }),
        }),
        { ...env(fakeAssets()), FORMS_SECRET: 'x', RESEND_API_KEY: 're_x' },
        ctx,
      );
    for (const path of ['/api/newsletter', '/api/reviews']) {
      const res = await post(path);
      expect(res.status).toBe(404);
      expect(((await res.json()) as ErrorJson).error.code).toBe('FEATURE_DISABLED');
    }
  });

  it('scheduled: lists the review window through Stripe when the keys are set', async () => {
    const list = vi.fn((_url: string) => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) {
        list(url);
        return Response.json({ object: 'list', data: [], has_more: false, url: '/v1' });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const controller = { scheduledTime: Date.UTC(2026, 10, 8, 9), cron: '0 9 * * *' };
    await worker.scheduled!(
      controller as ScheduledController,
      {
        ...env(fakeAssets()),
        STRIPE_SECRET_KEY: 'sk_test_cron',
        RESEND_API_KEY: 're_test',
        FORMS_SECRET: 'secret',
      },
      ctx,
    );
    expect(list).toHaveBeenCalledOnce();
    const url = new URL(String(list.mock.calls[0]![0]));
    const gte = Date.UTC(2026, 10, 8, 9) / 1000 - 8 * 86_400;
    expect(url.searchParams.get('created[gte]')).toBe(String(gte));
    expect(url.searchParams.get('created[lt]')).toBe(String(gte + 86_400));
    expect(url.searchParams.get('status')).toBe('complete');
    fetchSpy.mockRestore();
  });

  it('scheduled: does nothing without RESEND_API_KEY (no session marked for a logged e-mail)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await worker.scheduled!(
      { scheduledTime: Date.UTC(2026, 10, 8, 9), cron: '0 9 * * *' } as ScheduledController,
      { ...env(fakeAssets()), STRIPE_SECRET_KEY: 'sk_test_cron', FORMS_SECRET: 'secret' },
      ctx,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('shop facts', () => {
  it('worker/shop.ts mirrors brand in shop.yml', () => {
    const settings = parse(shopYml) as {
      brand: { name: string; email: string; phone: string; address: Record<string, string> };
    };
    expect(SHOP.name).toBe(settings.brand.name);
    expect(SHOP.email).toBe(settings.brand.email);
    expect(SHOP.phone).toBe(settings.brand.phone);
    expect(SHOP.address).toEqual(settings.brand.address);
  });
});
