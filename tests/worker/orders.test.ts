import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeError, maskEmail } from '../../worker/log';
import { orderNumber } from '../../worker/orders';
import { NOW, SESSION_ID, makeApp, sessionFixture, type ErrorJson } from './fixtures';

const HOUR = 60 * 60;
const createdHoursAgo = (hours: number) => Math.floor(NOW.getTime() / 1000) - hours * HOUR;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/orders/:sessionId', () => {
  it('maps a paid relay session to the spec 6.3 shape with a masked e-mail', async () => {
    const { app, stripe } = makeApp();
    const res = await app.request(`/api/orders/${SESSION_ID}`);
    expect(res.status).toBe(200);
    expect(stripe.retrieve).toHaveBeenCalledWith(SESSION_ID, {
      expand: ['shipping_cost.shipping_rate'],
    });
    expect(stripe.listLineItems).toHaveBeenCalledWith(SESSION_ID, {
      limit: 100,
      expand: ['data.price.product'],
    });
    expect(await res.json()).toEqual({
      status: 'paid',
      number: 'E5F6G7H8',
      lines: [
        { name: 'Poudre de moringa 100 g', quantity: 2, unitAmount: 890 },
        { name: 'Poudre de baobab 100 g', quantity: 1, unitAmount: 790 },
      ],
      amounts: { subtotal: 2570, shipping: 490, discount: 0, total: 3060, currency: 'eur' },
      delivery: {
        method: 'relay',
        relay: {
          id: 'FR-012345',
          name: 'Tabac de la Gare',
          address1: '12 Avenue de la Gare, Galerie marchande',
          postcode: '95400',
          city: 'Arnouville',
          country: 'FR',
        },
      },
      email: 'a***@***.com',
    });
  });

  it('reports the promotion code discount', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(
      sessionFixture({
        amount_total: 2560,
        total_details: { amount_discount: 500, amount_shipping: 490, amount_tax: 0 },
      }),
    );
    const body = (await (await app.request(`/api/orders/${SESSION_ID}`)).json()) as {
      amounts: Record<string, number>;
    };
    expect(body.amounts).toMatchObject({ discount: 500, total: 2560 });
  });

  it('shows every line, beyond the 10 an expand would return', async () => {
    const { app, stripe } = makeApp();
    const data = Array.from({ length: 12 }, (_, i) => ({
      id: `li_${i}`,
      description: `Produit ${i}`,
      quantity: 1,
      amount_subtotal: 100,
      amount_total: 100,
      price: { unit_amount: 100, product: { id: `prod_${i}`, metadata: { sku: `SKU-${i}` } } },
    }));
    stripe.listLineItems.mockResolvedValueOnce({
      object: 'list',
      has_more: false,
      url: '/v1/checkout/sessions/x/line_items',
      data,
    } as never);
    const body = (await (await app.request(`/api/orders/${SESSION_ID}`)).json()) as {
      lines: unknown[];
    };
    expect(body.lines).toHaveLength(12);
  });

  it('serves a session created 47 hours ago', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(sessionFixture({ created: createdHoursAgo(47) }));
    expect((await app.request(`/api/orders/${SESSION_ID}`)).status).toBe(200);
  });

  it('404 NOT_FOUND for a session older than 48 hours, lines never fetched', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(sessionFixture({ created: createdHoursAgo(49) }));
    const res = await app.request(`/api/orders/${SESSION_ID}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorJson).error.code).toBe('NOT_FOUND');
    expect(stripe.listLineItems).not.toHaveBeenCalled();
  });

  it.each([
    [{ payment_status: 'unpaid', status: 'open' }, 'unpaid'],
    [{ payment_status: 'unpaid', status: 'complete' }, 'pending'],
    [{ payment_status: 'unpaid', status: 'expired' }, 'unpaid'],
    [{ payment_status: 'no_payment_required', status: 'complete' }, 'paid'],
  ])('status mapping %o -> %s', async (fields, expected) => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(sessionFixture(fields));
    const body = (await (await app.request(`/api/orders/${SESSION_ID}`)).json()) as {
      status: string;
    };
    expect(body.status).toBe(expected);
  });

  it('rebuilds home and pickup deliveries from metadata', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(
      sessionFixture({ metadata: { locale: 'en', delivery_method: 'home', skus: 'REP-MOR-100' } }),
    );
    let body = (await (await app.request(`/api/orders/${SESSION_ID}`)).json()) as {
      delivery: unknown;
    };
    expect(body.delivery).toEqual({ method: 'home' });
    stripe.retrieve.mockResolvedValueOnce(
      sessionFixture({ metadata: { locale: 'fr', delivery_method: 'pickup' } }),
    );
    body = (await (await app.request(`/api/orders/${SESSION_ID}`)).json()) as { delivery: unknown };
    expect(body.delivery).toEqual({ method: 'pickup' });
  });

  it('400 VALIDATION_ERROR for a malformed session id, Stripe not called', async () => {
    const { app, stripe } = makeApp();
    const res = await app.request('/api/orders/pi_123');
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorJson).error.code).toBe('VALIDATION_ERROR');
    expect(stripe.retrieve).not.toHaveBeenCalled();
  });

  it('404 NOT_FOUND when Stripe has no such session', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockRejectedValueOnce(
      Object.assign(new Error('No such checkout.session'), {
        code: 'resource_missing',
        statusCode: 404,
      }),
    );
    const res = await app.request('/api/orders/cs_live_doesnotexist');
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorJson).error.code).toBe('NOT_FOUND');
  });

  it('404 NOT_FOUND for a session this shop did not create (no delivery metadata)', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockResolvedValueOnce(sessionFixture({ metadata: {} }));
    const res = await app.request(`/api/orders/${SESSION_ID}`);
    expect(res.status).toBe(404);
    expect(stripe.listLineItems).not.toHaveBeenCalled();
  });

  it('502 PAYMENT_PROVIDER_ERROR on other Stripe failures', async () => {
    const { app, stripe } = makeApp();
    stripe.retrieve.mockRejectedValueOnce(new Error('socket hang up'));
    const res = await app.request(`/api/orders/${SESSION_ID}`);
    expect(res.status).toBe(502);
  });

  it('502 PAYMENT_PROVIDER_ERROR when the lines cannot be listed', async () => {
    const { app, stripe } = makeApp();
    stripe.listLineItems.mockRejectedValueOnce(new Error('socket hang up'));
    const res = await app.request(`/api/orders/${SESSION_ID}`);
    expect(res.status).toBe(502);
  });
});

describe('helpers', () => {
  it('orderNumber takes the last 8 characters upper-cased', () => {
    expect(orderNumber('cs_test_a1B2c3D4e5F6g7H8')).toBe('E5F6G7H8');
  });

  it('maskEmail keeps the first character and the top-level domain only', () => {
    expect(maskEmail('marie@outlook.com')).toBe('m***@***.com');
    expect(maskEmail('awa.diallo@mail.example.co.uk')).toBe('a***@***.uk');
    expect(maskEmail('root@localhost')).toBe('r***@***');
    expect(maskEmail('@weird')).toBe('***');
    expect(maskEmail(null)).toBeNull();
  });

  it('describeError redacts keys and e-mail addresses and keeps the Stripe type', () => {
    const err = Object.assign(
      new Error('Invalid API Key provided: sk_live_******1234 for awa@example.com, whsec_abc123'),
      { type: 'StripeAuthenticationError' },
    );
    expect(describeError(err)).toBe(
      'Error [StripeAuthenticationError]: Invalid API Key provided: [redacted] for [redacted], [redacted]',
    );
    expect(describeError('re_AbCdEf123456 failed')).toBe('[redacted] failed');
  });
});
