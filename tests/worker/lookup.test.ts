import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normaliseOrderNumber } from '../../worker/orders';
import {
  SESSION_ID,
  fakeLimiter,
  makeApp,
  postJson,
  sessionFixture,
  sessionPage,
  type ErrorJson,
} from './fixtures';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const listed = (overrides: Record<string, unknown> = {}) =>
  sessionFixture({ line_items: undefined, ...overrides });

const body = { number: 'e5f6 g7h8', email: 'awa.diallo@example.com' };

describe('POST /api/orders/lookup', () => {
  it('normalises the number: spaces dropped, upper case', () => {
    expect(normaliseOrderNumber(' e5f6 g7h8 ')).toBe('E5F6G7H8');
  });

  it('finds the order by number and e-mail and answers the public order', async () => {
    const { app, stripe } = makeApp();
    stripe.list.mockResolvedValueOnce(
      sessionPage([listed({ id: 'cs_test_other00000000ZZZZ9999' }), listed()]),
    );
    const res = await postJson(app, '/api/orders/lookup', body);
    expect(res.status).toBe(200);
    expect(stripe.list).toHaveBeenCalledWith({
      customer_details: { email: 'awa.diallo@example.com' },
      limit: 100,
    });
    expect(stripe.listLineItems).toHaveBeenCalledWith(SESSION_ID, expect.anything());
    // The same shape as GET /api/orders/:id.
    const get = await app.request(`/api/orders/${SESSION_ID}`);
    expect(await res.json()).toEqual(await get.json());
  });

  it('no 48 h limit: an old order is still found', async () => {
    const { app, stripe } = makeApp();
    stripe.list.mockResolvedValueOnce(sessionPage([listed({ created: 1_700_000_000 })]));
    expect((await postJson(app, '/api/orders/lookup', body)).status).toBe(200);
  });

  it('retries the address in lower case once', async () => {
    const { app, stripe } = makeApp();
    stripe.list
      .mockResolvedValueOnce(sessionPage([]))
      .mockResolvedValueOnce(sessionPage([listed()]));
    const res = await postJson(app, '/api/orders/lookup', {
      ...body,
      email: 'Awa.Diallo@Example.com',
    });
    expect(res.status).toBe(200);
    expect(stripe.list.mock.calls.map((c) => c[0]!.customer_details!.email)).toEqual([
      'Awa.Diallo@Example.com',
      'awa.diallo@example.com',
    ]);
  });

  it.each([
    ['another number', { ...body, number: 'AAAABBBB' }, [listed()]],
    ['no session for that address', body, []],
    ['an abandoned checkout', body, [listed({ status: 'expired' })]],
    ['a session of another shop', body, [listed({ metadata: {} })]],
  ])('404 ORDER_NOT_FOUND: %s', async (_label, request, sessions) => {
    const { app, stripe } = makeApp();
    stripe.list.mockResolvedValue(sessionPage(sessions));
    const res = await postJson(app, '/api/orders/lookup', request);
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorJson).error.code).toBe('ORDER_NOT_FOUND');
    expect(stripe.listLineItems).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR for a missing number or a bad e-mail', async () => {
    const { app, stripe } = makeApp();
    for (const request of [
      { email: body.email },
      { ...body, email: 'x' },
      { ...body, number: ' ' },
    ]) {
      const res = await postJson(app, '/api/orders/lookup', request);
      expect(res.status).toBe(400);
    }
    expect(stripe.list).not.toHaveBeenCalled();
  });

  it('502 PAYMENT_PROVIDER_ERROR when Stripe fails', async () => {
    const { app, stripe } = makeApp();
    stripe.list.mockRejectedValueOnce(new Error('down'));
    const res = await postJson(app, '/api/orders/lookup', body);
    expect(res.status).toBe(502);
    expect(((await res.json()) as ErrorJson).error.code).toBe('PAYMENT_PROVIDER_ERROR');
  });

  it('403 from another origin; 405 for GET (not taken for a session id)', async () => {
    const { app } = makeApp();
    expect(
      (await postJson(app, '/api/orders/lookup', body, { Origin: 'https://evil.example' })).status,
    ).toBe(403);
    const res = await app.request('/api/orders/lookup');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('shares the orders limiter', async () => {
    const orders = fakeLimiter(0);
    const { app, stripe } = makeApp({ limiters: { orders: orders.limiter } });
    expect((await postJson(app, '/api/orders/lookup', body)).status).toBe(429);
    expect(stripe.list).not.toHaveBeenCalled();
  });
});
