import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDeliveryEstimate } from '../../worker/checkout';
import {
  ENV,
  NOW,
  RELAY,
  SESSION_ID,
  catalogFixture,
  makeApp,
  postJson,
  type ErrorJson,
} from './fixtures';

const relayBody = (overrides: Record<string, unknown> = {}) => ({
  locale: 'fr',
  items: [
    { sku: 'REP-MOR-100', quantity: 2 },
    { sku: 'REP-BAO-100', quantity: 1 },
  ],
  delivery: { method: 'relay', relay: RELAY },
  acceptedTerms: true,
  ...overrides,
});

async function errorOf(res: Response): Promise<ErrorJson['error']> {
  return ((await res.json()) as ErrorJson).error;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/checkout: happy paths', () => {
  it('relay: builds the session exactly per spec 6.3 and returns the Stripe URL', async () => {
    const { app, stripe } = makeApp();
    const res = await postJson(app, '/api/checkout', relayBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: `https://checkout.stripe.com/c/pay/${SESSION_ID}` });
    expect(stripe.create).toHaveBeenCalledOnce();
    const params = stripe.create.mock.calls[0]![0];
    expect(params).toEqual({
      mode: 'payment',
      locale: 'fr',
      line_items: [
        {
          quantity: 2,
          metadata: { sku: 'REP-MOR-100' },
          price_data: {
            currency: 'eur',
            unit_amount: 890,
            product_data: {
              name: 'Poudre de moringa 100 g',
              images: ['https://racinesenpartage.fr/_astro/moringa-100.CvuMJeko_Z1Kskv4.webp'],
              metadata: { sku: 'REP-MOR-100' },
            },
          },
        },
        {
          quantity: 1,
          metadata: { sku: 'REP-BAO-100' },
          price_data: {
            currency: 'eur',
            unit_amount: 790,
            product_data: {
              name: 'Poudre de baobab 100 g',
              images: ['https://racinesenpartage.fr/_astro/baobab-100.B695tBd0_Z1diFfw.webp'],
              metadata: { sku: 'REP-BAO-100' },
            },
          },
        },
      ],
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 490, currency: 'eur' },
            display_name: 'Point Relais Mondial Relay',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 5 },
            },
          },
        },
      ],
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      customer_creation: 'if_required',
      allow_promotion_codes: true,
      custom_text: {
        submit: {
          message: 'Livraison en Point Relais Mondial Relay : Tabac de la Gare, Arnouville.',
        },
      },
      metadata: {
        locale: 'fr',
        delivery_method: 'relay',
        relay_id: 'FR-012345',
        relay_name: 'Tabac de la Gare',
        relay_address: '12 Avenue de la Gare, Galerie marchande',
        relay_postcode: '95400',
        relay_city: 'Arnouville',
        relay_country: 'FR',
        skus: 'REP-MOR-100,REP-BAO-100',
      },
      success_url: 'https://racinesenpartage.fr/merci/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://racinesenpartage.fr/panier/',
      expires_at: NOW.getTime() / 1000 + 7200,
    });
    expect(params.shipping_address_collection).toBeUndefined();
  });

  it('home (EN): collects the shipping address in the allowed countries, English URLs', async () => {
    const { app, stripe } = makeApp();
    const res = await postJson(app, '/api/checkout', {
      locale: 'en',
      items: [{ sku: 'REP-MOR-100', quantity: 1 }],
      delivery: { method: 'home' },
      acceptedTerms: true,
    });
    expect(res.status).toBe(200);
    const params = stripe.create.mock.calls[0]![0];
    expect(params.locale).toBe('en');
    expect(params.shipping_address_collection).toEqual({ allowed_countries: ['FR'] });
    expect(params.custom_text).toBeUndefined();
    expect(params.metadata).toEqual({
      locale: 'en',
      delivery_method: 'home',
      skus: 'REP-MOR-100',
    });
    expect(params.line_items?.[0]?.price_data?.product_data?.name).toBe('Moringa powder 100 g');
    expect(params.shipping_options?.[0]?.shipping_rate_data).toMatchObject({
      display_name: 'Home delivery (Colissimo)',
      fixed_amount: { amount: 690, currency: 'eur' },
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 2 },
        maximum: { unit: 'business_day', value: 4 },
      },
    });
    expect(params.success_url).toBe(
      'https://racinesenpartage.fr/en/thank-you/?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(params.cancel_url).toBe('https://racinesenpartage.fr/en/cart/');
  });

  it('pickup: free, no estimate, pickup address in the submit message', async () => {
    const { app, stripe } = makeApp();
    const res = await postJson(app, '/api/checkout', {
      locale: 'fr',
      items: [{ sku: 'REP-BAO-100', quantity: 3 }],
      delivery: { method: 'pickup' },
      acceptedTerms: true,
    });
    expect(res.status).toBe(200);
    const params = stripe.create.mock.calls[0]![0];
    expect(params.shipping_options).toEqual([
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'eur' },
          display_name: 'Retrait gratuit à Arnouville',
        },
      },
    ]);
    expect(params.custom_text).toEqual({
      submit: {
        message:
          'Retrait gratuit sur rendez-vous : 9 Rue du Marché, 95400 Arnouville. Nous vous contactons pour fixer un créneau.',
      },
    });
    expect(params.metadata).toEqual({
      locale: 'fr',
      delivery_method: 'pickup',
      skus: 'REP-BAO-100',
    });
    expect(params.shipping_address_collection).toBeUndefined();
  });

  it('pickup (EN): English submit message', async () => {
    const { app, stripe } = makeApp();
    await postJson(app, '/api/checkout', {
      locale: 'en',
      items: [{ sku: 'REP-BAO-100', quantity: 1 }],
      delivery: { method: 'pickup' },
      acceptedTerms: true,
    });
    expect(stripe.create.mock.calls[0]![0].custom_text).toEqual({
      submit: {
        message:
          'Free pickup by appointment: 9 Rue du Marché, 95400 Arnouville. We will contact you to arrange a time.',
      },
    });
  });

  it('shipping is free when the subtotal reaches the threshold exactly', async () => {
    const { app, stripe } = makeApp({}, catalogFixture({ freeShippingFrom: 2570 }));
    await postJson(app, '/api/checkout', relayBody());
    const rate = stripe.create.mock.calls[0]![0].shipping_options?.[0]?.shipping_rate_data;
    expect(rate?.fixed_amount).toEqual({ amount: 0, currency: 'eur' });
  });

  it('shipping is charged one cent below the threshold', async () => {
    const { app, stripe } = makeApp({}, catalogFixture({ freeShippingFrom: 2571 }));
    await postJson(app, '/api/checkout', relayBody());
    const rate = stripe.create.mock.calls[0]![0].shipping_options?.[0]?.shipping_rate_data;
    expect(rate?.fixed_amount).toEqual({ amount: 490, currency: 'eur' });
  });

  it('free shipping disabled (null) always charges the method amount', async () => {
    const { app, stripe } = makeApp({}, catalogFixture({ freeShippingFrom: null }));
    await postJson(
      app,
      '/api/checkout',
      relayBody({ items: [{ sku: 'REP-MOR-100', quantity: 10 }] }),
    );
    const rate = stripe.create.mock.calls[0]![0].shipping_options?.[0]?.shipping_rate_data;
    expect(rate?.fixed_amount?.amount).toBe(490);
  });

  it('trims relay strings and keeps every metadata value within 500 characters', async () => {
    const { app, stripe } = makeApp();
    const longName = 'N'.repeat(80);
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({
        delivery: {
          method: 'relay',
          relay: {
            ...RELAY,
            name: `  ${longName}  `,
            address1: ` ${'A'.repeat(120)} `,
            address2: 'B'.repeat(120),
            city: ' Arnouville ',
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    const meta = stripe.create.mock.calls[0]![0].metadata!;
    expect(meta.relay_name).toBe(longName);
    expect(meta.relay_city).toBe('Arnouville');
    for (const value of Object.values(meta)) expect(String(value).length).toBeLessThanOrEqual(500);
  });

  it.each([
    ['name', 81],
    ['address1', 121],
    ['address2', 121],
    ['city', 61],
  ])('400 VALIDATION_ERROR when relay %s is longer than its limit', async (field, length) => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({
        delivery: { method: 'relay', relay: { ...RELAY, [field]: 'N'.repeat(length) } },
      }),
    );
    expect(res.status).toBe(400);
    const issues = (await errorOf(res)).details!.issues as Array<{ path: string }>;
    expect(issues[0]!.path).toBe(`delivery.relay.${field}`);
  });

  it('accepts accents, digits and the allowed punctuation; folds typographic apostrophes', async () => {
    const { app, stripe } = makeApp();
    const relay = {
      ...RELAY,
      name: 'Café l’Étoile & Fils (Tabac-Presse)',
      address1: "12/14 Rue de l'Église, Bât. B",
      address2: '',
      city: 'Saint-Brice-sous-Forêt',
    };
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({ delivery: { method: 'relay', relay } }),
    );
    expect(res.status).toBe(200);
    const params = stripe.create.mock.calls[0]![0];
    expect(params.metadata!.relay_name).toBe("Café l'Étoile & Fils (Tabac-Presse)");
    expect(params.metadata!.relay_address).toBe("12/14 Rue de l'Église, Bât. B");
    expect(params.custom_text).toEqual({
      submit: {
        message:
          "Livraison en Point Relais Mondial Relay : Café l'Étoile & Fils (Tabac-Presse), Saint-Brice-sous-Forêt.",
      },
    });
  });

  it.each([
    ['name', 'Tabac <b>de la Gare</b>'],
    ['name', 'Pay at https://evil.example'],
    ['address1', '12 Avenue\nde la Gare'],
    ['address2', 'Appelez le +33 6 12 34 56 78'],
    ['city', 'Arnouville; DROP'],
    ['city', 'Arnouville "Centre"'],
  ])('400 VALIDATION_ERROR for a relay %s outside the allow-list (%s)', async (field, value) => {
    const { app, stripe } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({ delivery: { method: 'relay', relay: { ...RELAY, [field]: value } } }),
    );
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(error)).not.toContain(value);
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it.each(['95 400', '95-400', '12', 'A'.repeat(11), '95400!'])(
    '400 VALIDATION_ERROR for the relay postcode %s',
    async (postcode) => {
      const { app } = makeApp();
      const res = await postJson(
        app,
        '/api/checkout',
        relayBody({ delivery: { method: 'relay', relay: { ...RELAY, postcode } } }),
      );
      expect(res.status).toBe(400);
    },
  );

  it('400 VALIDATION_ERROR when the relay id prefix is not the relay country', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({ delivery: { method: 'relay', relay: { ...RELAY, id: 'BE-012345' } } }),
    );
    expect(res.status).toBe(400);
    const issues = (await errorOf(res)).details!.issues as Array<{ path: string }>;
    expect(issues.map((i) => i.path)).toContain('delivery.relay.id');
  });

  it('accepts a localhost origin when SITE_URL is localhost (wrangler dev)', async () => {
    const { app } = makeApp({ env: { ...ENV, SITE_URL: 'http://localhost:8787' } });
    const res = await postJson(app, '/api/checkout', relayBody(), {
      Origin: 'http://127.0.0.1:8787',
    });
    expect(res.status).toBe(200);
  });

  it('403 FORBIDDEN_ORIGIN for a localhost origin against the production SITE_URL', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/checkout', relayBody(), {
      Origin: 'http://localhost:8787',
    });
    expect(res.status).toBe(403);
  });

  it('falls back on the Referer when Origin is absent', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/checkout', relayBody(), {
      Referer: 'https://racinesenpartage.fr/commande/',
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/checkout: errors', () => {
  it('400 VALIDATION_ERROR on malformed JSON', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/checkout', '{"locale":');
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR lists the offending paths without echoing values', async () => {
    const { app, stripe } = makeApp();
    const res = await postJson(app, '/api/checkout', {
      locale: 'de',
      items: [{ sku: 'REP-MOR-100', quantity: 0 }],
      delivery: { method: 'drone' },
      acceptedTerms: false,
    });
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    const paths = (error.details!.issues as Array<{ path: string }>).map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining(['locale', 'items.0.quantity', 'delivery.method', 'acceptedTerms']),
    );
    expect(JSON.stringify(error)).not.toContain('drone');
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR when the terms are not accepted', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/checkout', relayBody({ acceptedTerms: false }));
    expect(res.status).toBe(400);
  });

  it('400 VALIDATION_ERROR above 30 lines', async () => {
    const { app } = makeApp();
    const items = Array.from({ length: 31 }, (_, i) => ({ sku: `REP-X-${i}`, quantity: 1 }));
    const res = await postJson(app, '/api/checkout', relayBody({ items }));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).details).toEqual({
      issues: [expect.objectContaining({ path: 'items', code: 'too_big' })],
    });
  });

  it('400 VALIDATION_ERROR on an empty cart', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/checkout', relayBody({ items: [] }));
    expect(res.status).toBe(400);
  });

  it('400 VALIDATION_ERROR above maxQuantityPerLine from the catalogue', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({ items: [{ sku: 'REP-MOR-100', quantity: 11 }] }),
    );
    expect(res.status).toBe(400);
    expect((await errorOf(res)).details).toEqual({
      issues: [
        { path: 'items.0.quantity', code: 'too_big', message: 'Quantity must be at most 10' },
      ],
    });
  });

  it('400 VALIDATION_ERROR on a duplicated SKU', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({
        items: [
          { sku: 'REP-MOR-100', quantity: 1 },
          { sku: 'REP-MOR-100', quantity: 2 },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('400 VALIDATION_ERROR on a malformed relay id', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({ delivery: { method: 'relay', relay: { ...RELAY, id: '012345' } } }),
    );
    expect(res.status).toBe(400);
    const issues = (await errorOf(res)).details!.issues as Array<{ path: string }>;
    expect(issues[0]!.path).toBe('delivery.relay.id');
  });

  it('403 FORBIDDEN_ORIGIN for another site', async () => {
    const { app, stripe } = makeApp();
    const res = await postJson(app, '/api/checkout', relayBody(), {
      Origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('FORBIDDEN_ORIGIN');
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it('403 FORBIDDEN_ORIGIN without Origin or Referer', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/checkout', relayBody(), {});
    expect(res.status).toBe(403);
  });

  it('415 UNSUPPORTED_MEDIA_TYPE for a form post', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/checkout', {
      method: 'POST',
      headers: { ...{ Origin: 'https://racinesenpartage.fr' }, 'Content-Type': 'text/plain' },
      body: JSON.stringify(relayBody()),
    });
    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('413 PAYLOAD_TOO_LARGE above 32 KB', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/checkout', relayBody({ padding: 'x'.repeat(33 * 1024) }));
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('503 SHOP_CLOSED when the catalogue says the shop is closed', async () => {
    const { app, stripe } = makeApp({}, catalogFixture({ shopOpen: false }));
    const res = await postJson(app, '/api/checkout', relayBody());
    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe('SHOP_CLOSED');
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it('409 UNKNOWN_SKU lists every unknown SKU', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({
        items: [
          { sku: 'REP-NOPE-1', quantity: 1 },
          { sku: 'REP-MOR-100', quantity: 1 },
          { sku: 'REP-NOPE-2', quantity: 1 },
        ],
      }),
    );
    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error.code).toBe('UNKNOWN_SKU');
    expect(error.details).toEqual({ skus: ['REP-NOPE-1', 'REP-NOPE-2'] });
  });

  it('409 OUT_OF_STOCK lists every out-of-stock SKU; low stock passes', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({
        items: [
          { sku: 'REP-ORG-100', quantity: 1 },
          { sku: 'REP-BAO-100', quantity: 1 },
          { sku: 'REP-SOU-P100', quantity: 2 },
        ],
      }),
    );
    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error.code).toBe('OUT_OF_STOCK');
    expect(error.details).toEqual({ skus: ['REP-ORG-100', 'REP-SOU-P100'] });
  });

  it('409 SHIPPING_UNAVAILABLE when the method is disabled', async () => {
    const catalog = catalogFixture();
    catalog.shipping = catalog.shipping.map((s) =>
      s.id === 'relay' ? { ...s, enabled: false } : s,
    );
    const { app } = makeApp({}, catalog);
    const res = await postJson(app, '/api/checkout', relayBody());
    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error.code).toBe('SHIPPING_UNAVAILABLE');
    expect(error.details).toEqual({ method: 'relay', reason: 'disabled' });
  });

  it('409 SHIPPING_UNAVAILABLE for home delivery without an allowed country', async () => {
    const catalog = catalogFixture();
    catalog.shipping = catalog.shipping.map((s) => (s.id === 'home' ? { ...s, countries: [] } : s));
    const { app } = makeApp({}, catalog);
    const res = await postJson(app, '/api/checkout', relayBody({ delivery: { method: 'home' } }));
    expect(res.status).toBe(409);
    expect((await errorOf(res)).details).toEqual({ method: 'home', reason: 'no_country' });
  });

  it('409 SHIPPING_UNAVAILABLE for a relay point outside the relay countries', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({
        delivery: { method: 'relay', relay: { ...RELAY, id: 'ES-012345', country: 'ES' } },
      }),
    );
    expect(res.status).toBe(409);
    expect((await errorOf(res)).details).toEqual({ method: 'relay', reason: 'country' });
  });

  it('502 PAYMENT_PROVIDER_ERROR without leaking the Stripe message', async () => {
    const { app, stripe } = makeApp();
    stripe.create.mockRejectedValueOnce(new Error('Invalid API Key provided: sk_test_****1234'));
    const res = await postJson(app, '/api/checkout', relayBody());
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain('PAYMENT_PROVIDER_ERROR');
    expect(body).not.toContain('sk_test');
  });

  it('503 CATALOG_UNAVAILABLE when the catalogue cannot be loaded', async () => {
    const { app } = makeApp({ loadCatalog: () => Promise.reject(new Error('HTTP 500')) });
    const res = await postJson(app, '/api/checkout', relayBody());
    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe('CATALOG_UNAVAILABLE');
  });

  it('uses SITE_URL without a trailing slash duplicate', async () => {
    const { app, stripe } = makeApp({ env: { ...ENV, SITE_URL: 'https://racinesenpartage.fr/' } });
    await postJson(app, '/api/checkout', relayBody());
    expect(stripe.create.mock.calls[0]![0].cancel_url).toBe('https://racinesenpartage.fr/panier/');
  });
});

describe('parseDeliveryEstimate', () => {
  it.each([
    ['3 à 5 jours ouvrés', { min: 3, max: 5, unit: 'business_day' }],
    ['3 to 5 working days', { min: 3, max: 5, unit: 'business_day' }],
    ['2 jours', { min: 2, max: 2, unit: 'day' }],
    ['1-2 days', { min: 1, max: 2, unit: 'day' }],
  ])('%s', (text, { min, max, unit }) => {
    expect(parseDeliveryEstimate(text)).toEqual({
      minimum: { unit, value: min },
      maximum: { unit, value: max },
    });
  });

  it('returns undefined when no day count parses', () => {
    expect(parseDeliveryEstimate('sur rendez-vous, 9 Rue du Marché')).toBeUndefined();
    expect(parseDeliveryEstimate('5 à 3 jours')).toBeUndefined();
  });
});

describe('POST /api/checkout: audit fixes', () => {
  it('409 PRICE_CHANGED when the page showed another price (stale tab, deploy window)', async () => {
    const { app, stripe } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({
        items: [
          { sku: 'REP-MOR-100', quantity: 2, unitAmount: 850 },
          { sku: 'REP-BAO-100', quantity: 1, unitAmount: 790 },
        ],
      }),
    );
    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error.code).toBe('PRICE_CHANGED');
    expect(error.details).toEqual({ skus: ['REP-MOR-100'] });
    expect(stripe.create).not.toHaveBeenCalled();
  });

  it('passes when the page prices match the catalogue, or when none are sent', async () => {
    const { app, stripe } = makeApp();
    const matching = await postJson(
      app,
      '/api/checkout',
      relayBody({
        items: [
          { sku: 'REP-MOR-100', quantity: 2, unitAmount: 890 },
          { sku: 'REP-BAO-100', quantity: 1, unitAmount: 790 },
        ],
      }),
    );
    expect(matching.status).toBe(200);
    expect(stripe.create.mock.calls[0]![0].line_items![0]!.price_data!.unit_amount).toBe(890);
    expect((await postJson(app, '/api/checkout', relayBody())).status).toBe(200);
  });

  it('400 VALIDATION_ERROR for a non-integer page price', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({ items: [{ sku: 'REP-MOR-100', quantity: 1, unitAmount: 8.9 }] }),
    );
    expect(res.status).toBe(400);
  });

  it('unknown SKUs and out-of-stock lines are reported before a price change', async () => {
    const { app } = makeApp();
    const res = await postJson(
      app,
      '/api/checkout',
      relayBody({
        items: [
          { sku: 'REP-MOR-100', quantity: 1, unitAmount: 1 },
          { sku: 'REP-ORG-100', quantity: 1, unitAmount: 590 },
        ],
      }),
    );
    expect((await errorOf(res)).code).toBe('OUT_OF_STOCK');
  });

  it('keeps the shipping rate display name within 100 characters', async () => {
    const catalog = catalogFixture();
    catalog.shipping[0]!.label.fr = 'Point Relais '.repeat(12);
    const { app, stripe } = makeApp({}, catalog);
    await postJson(app, '/api/checkout', relayBody());
    const name =
      stripe.create.mock.calls[0]![0].shipping_options![0]!.shipping_rate_data!.display_name;
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.startsWith('Point Relais Point Relais')).toBe(true);
  });

  it('tags each line item with its SKU (read back without the product expansion)', async () => {
    const { app, stripe } = makeApp();
    await postJson(app, '/api/checkout', relayBody());
    const items = stripe.create.mock.calls[0]![0].line_items!;
    expect(items.map((i) => i.metadata)).toEqual([{ sku: 'REP-MOR-100' }, { sku: 'REP-BAO-100' }]);
  });

  it('a checkout from the workers.dev preview returns to that host, not to production', async () => {
    const { app, stripe } = makeApp();
    const preview = 'https://racines-en-partage.marie.workers.dev';
    const res = await app.request(`${preview}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: preview },
      body: JSON.stringify(relayBody()),
    });
    expect(res.status).toBe(200);
    const params = stripe.create.mock.calls[0]![0];
    expect(params.success_url).toBe(`${preview}/merci/?session_id={CHECKOUT_SESSION_ID}`);
    expect(params.cancel_url).toBe(`${preview}/panier/`);
  });

  it('the custom domain keeps SITE_URL for the return URLs', async () => {
    const { app, stripe } = makeApp();
    const res = await app.request('https://www.racinesenpartage.fr/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://www.racinesenpartage.fr' },
      body: JSON.stringify(relayBody()),
    });
    expect(res.status).toBe(200);
    expect(stripe.create.mock.calls[0]![0].cancel_url).toBe('https://racinesenpartage.fr/panier/');
  });
});
