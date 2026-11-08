import { describe, expect, it, vi } from 'vitest';
import {
  ERROR_KEY,
  buildCheckoutRequest,
  claimOrderClear,
  releaseOrderClear,
  getOrder,
  isSessionId,
  parseApiError,
  parseOrder,
  postCheckout,
  safeRedirect,
} from '../../src/cart/api';
import {
  decodeEntities,
  displayCase,
  hoursTableHtml,
  mapParcelShop,
  parseHoursTable,
  parseInlineHandler,
  relayId,
  sanitizeHoursHtml,
} from '../../src/cart/relay';
import { emptyCart, type CartState } from '../../src/cart/store';

// Shape of a real payload captured from the v4 widget with the BDTEST brand.
const payload = {
  ID: '016741',
  Nom: 'TABAC  DU MARCHE ',
  Adresse1: '2 RUE DE LA GARE',
  Adresse2: '',
  CP: '95400',
  Ville: 'ARNOUVILLE',
  Pays: 'FR',
  Lat: '48,98712',
  Long: '2,41733',
  Nature: '1',
  Available: true,
  HoursHtmlTable:
    "<table class='PR-Hours' border='0'><tr class='d'><th>Lun</th><td>09:00-12:30</td><td>14:00-19:00</td></tr>" +
    '<tr><th>Mar</th><td onclick="alert(1)">09:00-12:30<img src=x onerror=alert(2)></td><td>&nbsp;</td></tr>' +
    '<tr><th>Dim</th><td>Ferm&eacute;</td><td>-</td></tr></table>',
  Photo: '',
  Warning: '',
  Letter: 'A',
};

describe('relay payload mapping', () => {
  it('maps the payload to a RelayPoint with the CC-6digits id', () => {
    const point = mapParcelShop(payload)!;
    expect(point).toMatchObject({
      id: 'FR-016741',
      name: 'TABAC DU MARCHE',
      address1: '2 RUE DE LA GARE',
      postcode: '95400',
      city: 'ARNOUVILLE',
      country: 'FR',
    });
    expect(point.address2).toBeUndefined();
    expect(point.hoursHtml).toBe(
      '<table><tr><th>Lun</th><td>09:00-12:30</td><td>14:00-19:00</td></tr>' +
        '<tr><th>Mar</th><td>09:00-12:30</td><td></td></tr>' +
        '<tr><th>Dim</th><td>Fermé</td><td>-</td></tr></table>',
    );
  });

  it('folds characters the Worker refuses, so a real point is never rejected', () => {
    const point = mapParcelShop({
      ...payload,
      Nom: 'RELAIS N°12 "CHEZ PAUL" + LOTO!',
      Adresse1: '4 RUE DU 8 MAI 1945 ; BAT. C',
      Adresse2: 'C/O SARL D’ICI',
      Ville: 'SAINT-BRICE-SOUS-FORÊT',
    })!;
    expect(point.name).toBe('RELAIS N 12 CHEZ PAUL LOTO');
    expect(point.address1).toBe('4 RUE DU 8 MAI 1945 BAT. C');
    expect(point.address2).toBe("C/O SARL D'ICI");
    expect(point.city).toBe('SAINT-BRICE-SOUS-FORÊT');
    // Within the Worker's limits (name 80, address 120, city 60).
    const long = mapParcelShop({ ...payload, Nom: 'A'.repeat(100), Ville: 'B'.repeat(70) })!;
    expect(long.name).toHaveLength(80);
    expect(long.city).toHaveLength(60);
  });

  it('keeps address2 when present and rejects unusable payloads', () => {
    expect(mapParcelShop({ ...payload, Adresse2: 'Centre commercial' })?.address2).toBe(
      'Centre commercial',
    );
    expect(mapParcelShop(null)).toBeNull();
    expect(mapParcelShop({ ...payload, ID: '' })).toBeNull();
    expect(mapParcelShop({ ...payload, Nom: ' ' })).toBeNull();
    expect(mapParcelShop({ ...payload, Pays: 'FRA', ID: '016741' })).toBeNull();
  });

  it('normalises ids with or without a prefix', () => {
    expect(relayId('016741', 'FR')).toBe('FR-016741');
    expect(relayId('FR-016741', '')).toBe('FR-016741');
    expect(relayId('be012345', 'BE')).toBe('BE-012345');
    expect(relayId('6741', 'lu')).toBe('LU-006741');
    expect(relayId(16741, 'FR')).toBe('FR-016741');
    expect(relayId('1234567', 'FR')).toBeNull();
    expect(relayId('abc', 'FR')).toBeNull();
  });

  it('parses the hours table into text cells and drops every attribute and tag', () => {
    expect(parseHoursTable(payload.HoursHtmlTable)).toEqual([
      ['Lun', '09:00-12:30', '14:00-19:00'],
      ['Mar', '09:00-12:30', ''],
      ['Dim', 'Fermé', '-'],
    ]);
    expect(parseHoursTable('<script>alert(1)</script>')).toEqual([]);
    expect(parseHoursTable('')).toEqual([]);
  });

  it('escapes cell text when it rebuilds the table', () => {
    const html = hoursTableHtml([['<b>Lun</b>', 'a & b']]);
    expect(html).toBe('<table><tr><th>&lt;b&gt;Lun&lt;/b&gt;</th><td>a &amp; b</td></tr></table>');
    expect(sanitizeHoursHtml(undefined)).toBe('');
    // Idempotent: a stored table sanitises to itself.
    expect(sanitizeHoursHtml(html)).toBe(html);
  });

  it('decodes numeric and named entities, leaves unknown ones', () => {
    expect(decodeEntities('&#233;t&#xE9; &amp; &foo;')).toBe('été & &foo;');
    expect(decodeEntities('a&nbsp;b &Eacute;')).toBe('a\u00a0b é');
  });
});

describe('widget inline handlers (replayed without eval)', () => {
  it('parses the trigger and toggleClass shapes of widget 4.0.11', () => {
    expect(parseInlineHandler('MR_jQuery("#rep-relay-widget").trigger("FocusOnMap",3)')).toEqual({
      kind: 'trigger',
      selector: '#rep-relay-widget',
      event: 'FocusOnMap',
      arg: 3,
    });
    expect(parseInlineHandler('MR_jQuery("#close-pop").trigger("ClearSelection");')).toEqual({
      kind: 'trigger',
      selector: '#close-pop',
      event: 'ClearSelection',
    });
    expect(
      parseInlineHandler("MR_jQuery(this).parent().find('.MRW-RList').toggleClass('Hide');"),
    ).toEqual({ kind: 'toggleClass', find: '.MRW-RList', className: 'Hide' });
  });

  it('refuses anything else', () => {
    for (const code of [
      'alert(1)',
      'MR_jQuery("#x").trigger("A",1);alert(1)',
      'MR_jQuery("body *").trigger("A")',
      'MR_jQuery(this).remove()',
      '',
    ])
      expect(parseInlineHandler(code), code).toBeNull();
  });
});

describe('displayCase', () => {
  it('title-cases upper-case widget labels and keeps mixed case', () => {
    expect(displayCase('LOCKER 24/7 LIDL ARNOUVILLE')).toBe('Locker 24/7 Lidl Arnouville');
    expect(displayCase('95140 - GARGES LES GONESSE')).toBe('95140 - Garges Les Gonesse');
    expect(displayCase("L'ÉPICERIE DU COIN")).toBe("L'Épicerie Du Coin");
    expect(displayCase('Tabac du Marché')).toBe('Tabac du Marché');
  });
});

const NOW = new Date('2026-11-01T00:00:00Z');
const cart = (patch: Partial<CartState>): CartState => ({ ...emptyCart(NOW), ...patch });

describe('checkout request (spec 6.3)', () => {
  it('builds the contract body', () => {
    expect(
      buildCheckoutRequest(
        cart({
          lines: [
            { sku: 'REP-MOR-100', quantity: 2 },
            { sku: 'REP-BAO-100', quantity: 1 },
          ],
          delivery: { method: 'pickup' },
        }),
        'en',
      ),
    ).toEqual({
      locale: 'en',
      items: [
        { sku: 'REP-MOR-100', quantity: 2 },
        { sku: 'REP-BAO-100', quantity: 1 },
      ],
      delivery: { method: 'pickup' },
      acceptedTerms: true,
    });
  });

  it('sends the relay point without its opening hours', () => {
    const relay = mapParcelShop(payload)!;
    const body = buildCheckoutRequest(
      cart({ lines: [{ sku: 'REP-MOR-100', quantity: 1 }], delivery: { method: 'relay', relay } }),
      'fr',
    )!;
    expect(body.delivery).toEqual({
      method: 'relay',
      relay: {
        id: 'FR-016741',
        name: 'TABAC DU MARCHE',
        address1: '2 RUE DE LA GARE',
        postcode: '95400',
        city: 'ARNOUVILLE',
        country: 'FR',
      },
    });
  });

  it('sends the unit price the page showed, so the Worker can refuse a stale page', () => {
    const products = {
      'REP-MOR-100': { unitAmount: 890 },
      'REP-BAO-100': { unitAmount: 790 },
    };
    const body = buildCheckoutRequest(
      cart({
        lines: [
          { sku: 'REP-MOR-100', quantity: 2 },
          { sku: 'REP-GONE-1', quantity: 1 },
        ],
        delivery: { method: 'home' },
      }),
      'fr',
      products,
    )!;
    expect(body.items).toEqual([
      { sku: 'REP-MOR-100', quantity: 2, unitAmount: 890 },
      { sku: 'REP-GONE-1', quantity: 1 },
    ]);
  });

  it('returns null without lines or delivery', () => {
    expect(buildCheckoutRequest(cart({ delivery: { method: 'home' } }), 'fr')).toBeNull();
    expect(
      buildCheckoutRequest(cart({ lines: [{ sku: 'REP-MOR-100', quantity: 1 }] }), 'fr'),
    ).toBeNull();
  });
});

describe('API errors and responses', () => {
  it('parses the uniform error body', () => {
    expect(
      parseApiError(409, {
        error: { code: 'OUT_OF_STOCK', message: 'x', details: { skus: ['REP-CAC-100', 3] } },
      }),
    ).toEqual({ code: 'OUT_OF_STOCK', status: 409, skus: ['REP-CAC-100'] });
    expect(parseApiError(503, { error: { code: 'SHOP_CLOSED' } }).code).toBe('SHOP_CLOSED');
    expect(parseApiError(500, 'Internal')).toEqual({ code: 'UNKNOWN', status: 500, skus: [] });
    expect(parseApiError(418, { error: { code: 'TEAPOT' } }).code).toBe('UNKNOWN');
    expect(
      parseApiError(409, { error: { code: 'PRICE_CHANGED', details: { skus: ['REP-MOR-100'] } } }),
    ).toEqual({ code: 'PRICE_CHANGED', status: 409, skus: ['REP-MOR-100'] });
    expect(parseApiError(429, { error: { code: 'RATE_LIMITED' } }).code).toBe('RATE_LIMITED');
    expect(parseApiError(503, { error: { code: 'CATALOG_UNAVAILABLE' } }).code).toBe(
      'CATALOG_UNAVAILABLE',
    );
  });

  it('gives the codes a customer can act on their own message', () => {
    expect(ERROR_KEY.RATE_LIMITED).toBe('rateLimited');
    expect(ERROR_KEY.CATALOG_UNAVAILABLE).toBe('unavailable');
    expect(ERROR_KEY.PRICE_CHANGED).toBe('priceChanged');
    expect(ERROR_KEY.INTERNAL_ERROR).toBe('generic');
  });

  it('postCheckout returns the url on 200, the parsed error otherwise, NETWORK on failure', async () => {
    const ok = vi.fn(async () => Response.json({ url: 'https://checkout.stripe.com/c/pay/cs' }));
    const body = buildCheckoutRequest(
      cart({ lines: [{ sku: 'REP-MOR-100', quantity: 1 }], delivery: { method: 'home' } }),
      'fr',
    )!;
    expect(await postCheckout(body, ok as unknown as typeof fetch)).toEqual({
      ok: true,
      url: 'https://checkout.stripe.com/c/pay/cs',
    });
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(body);

    const conflict = vi.fn(async () =>
      Response.json({ error: { code: 'UNKNOWN_SKU', message: 'x' } }, { status: 409 }),
    );
    expect(await postCheckout(body, conflict as unknown as typeof fetch)).toEqual({
      ok: false,
      error: { code: 'UNKNOWN_SKU', status: 409, skus: [] },
    });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await postCheckout(body, down as unknown as typeof fetch)).toEqual({
      ok: false,
      error: { code: 'NETWORK', status: 0, skus: [] },
    });
  });

  it('only redirects to the same origin or Stripe over https', () => {
    const origin = 'https://racinesenpartage.fr';
    expect(safeRedirect('https://checkout.stripe.com/c/pay/cs_test', origin)).toBe(
      'https://checkout.stripe.com/c/pay/cs_test',
    );
    expect(safeRedirect('/merci/?session_id=cs_test_123', origin)).toBe(
      'https://racinesenpartage.fr/merci/?session_id=cs_test_123',
    );
    expect(safeRedirect('http://checkout.stripe.com/x', origin)).toBeNull();
    expect(safeRedirect('https://evil.example/stripe.com', origin)).toBeNull();
    expect(safeRedirect('javascript:alert(1)', origin)).toBeNull();
    expect(safeRedirect(42, origin)).toBeNull();
  });

  it('validates session ids', () => {
    expect(isSessionId('cs_test_123')).toBe(true);
    expect(isSessionId('cs_live_a1B2c3')).toBe(true);
    expect(isSessionId(null)).toBe(false);
    expect(isSessionId('cs_test_../../x')).toBe(false);
    expect(isSessionId('pi_123')).toBe(false);
  });

  const order = {
    status: 'paid',
    number: 'RP-2026-0001',
    lines: [{ name: 'Poudre de moringa 100 g', quantity: 2, unitAmount: 890 }],
    amounts: { subtotal: 1780, shipping: 490, discount: 0, total: 2270, currency: 'eur' },
    delivery: { method: 'pickup' },
    email: 'm***@example.com',
  };

  it('parses an order and refuses broken ones', () => {
    expect(parseOrder(order)).toEqual(order);
    expect(parseOrder({ ...order, status: 'refunded' })).toBeNull();
    expect(parseOrder({ ...order, amounts: { ...order.amounts, total: 22.7 } })).toBeNull();
    expect(parseOrder(null)).toBeNull();
    expect(
      parseOrder({ ...order, amounts: { ...order.amounts, discount: 300, total: 1970 } })?.amounts
        .discount,
    ).toBe(300);
    // A Worker without the field, or a junk value: no discount row.
    const { discount: _d, ...withoutDiscount } = order.amounts;
    expect(parseOrder({ ...order, amounts: withoutDiscount })?.amounts.discount).toBe(0);
    expect(
      parseOrder({ ...order, amounts: { ...order.amounts, discount: '3' } })?.amounts.discount,
    ).toBe(0);
    expect(
      parseOrder({ ...order, lines: [...order.lines, { name: 1, quantity: 1, unitAmount: 1 }] })
        ?.lines,
    ).toEqual(order.lines);
  });

  it('getOrder tells a missing order from a lookup that may succeed later', async () => {
    const ok = vi.fn(async () => Response.json(order));
    expect(await getOrder('cs_test_123', ok as unknown as typeof fetch)).toEqual({
      status: 'found',
      order,
    });
    expect((ok.mock.calls[0] as unknown as [string])[0]).toBe('/api/orders/cs_test_123');
    const respond = (status: number, code: string) =>
      vi.fn(async () => Response.json({ error: { code } }, { status })) as unknown as typeof fetch;
    expect(await getOrder('cs_test_123', respond(404, 'NOT_FOUND'))).toEqual({ status: 'missing' });
    expect(await getOrder('cs_test_123', respond(400, 'VALIDATION_ERROR'))).toEqual({
      status: 'missing',
    });
    expect(await getOrder('cs_test_123', respond(429, 'RATE_LIMITED'))).toEqual({
      status: 'failed',
    });
    expect(await getOrder('cs_test_123', respond(502, 'PAYMENT_PROVIDER_ERROR'))).toEqual({
      status: 'failed',
    });
    const down = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await getOrder('cs_test_123', down as unknown as typeof fetch)).toEqual({
      status: 'failed',
    });
    const junk = vi.fn(async () => Response.json({ status: 'refunded' }));
    expect(await getOrder('cs_test_123', junk as unknown as typeof fetch)).toEqual({
      status: 'failed',
    });
  });

  it('claimOrderClear empties the cart once per order, never on a later visit', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
    expect(claimOrderClear(storage, 'cs_test_1')).toBe(true);
    expect(claimOrderClear(storage, 'cs_test_1')).toBe(false);
    expect(claimOrderClear(storage, 'cs_test_2')).toBe(true);
    expect(claimOrderClear(storage, 'cs_test_1')).toBe(false);
    // Without storage the cart is still emptied (the order page cannot remember).
    expect(claimOrderClear(null, 'cs_test_3')).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    expect(claimOrderClear(broken, 'cs_test_4')).toBe(true);
  });

  it('releaseOrderClear forgets one claim, so a later visit empties the cart again', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
    expect(claimOrderClear(storage, 'cs_test_1')).toBe(true);
    expect(claimOrderClear(storage, 'cs_test_2')).toBe(true);
    releaseOrderClear(storage, 'cs_test_1');
    expect(claimOrderClear(storage, 'cs_test_2')).toBe(false);
    expect(claimOrderClear(storage, 'cs_test_1')).toBe(true);
    // Nothing stored, no storage, corrupt value: no throw.
    releaseOrderClear(null, 'cs_test_1');
    map.set('rep.cart.cleared', '{');
    expect(() => releaseOrderClear(storage, 'cs_test_1')).not.toThrow();
  });
});
