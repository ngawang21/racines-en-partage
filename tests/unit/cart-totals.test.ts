import { describe, expect, it } from 'vitest';
import type { ClientCatalog, ClientProduct } from '../../src/catalog/build';
import { emptyCart, type CartState, type Delivery } from '../../src/cart/store';
import { computeTotals, shippingAmount } from '../../src/cart/totals';

const product = (sku: string, unitAmount: number, stock: ClientProduct['stock'] = 'in_stock') =>
  ({
    sku,
    slug: sku.toLowerCase(),
    url: `/produits/${sku.toLowerCase()}/`,
    name: `${sku} 100 g`,
    weightGrams: 100,
    unitAmount,
    stock,
    image: `/_astro/${sku}.webp`,
  }) satisfies ClientProduct;

const catalog: ClientCatalog = {
  locale: 'fr',
  currency: 'eur',
  shopOpen: true,
  maxQuantityPerLine: 10,
  freeShippingFrom: 4900,
  shipping: [
    { id: 'relay', amount: 490, countries: ['FR', 'BE', 'LU'], label: 'Relais', estimate: '3' },
    { id: 'home', amount: 690, countries: ['FR'], label: 'Domicile', estimate: '2' },
    { id: 'pickup', amount: 0, countries: ['FR'], label: 'Retrait', estimate: 'rdv' },
  ],
  products: {
    'REP-MOR-100': product('REP-MOR-100', 890),
    'REP-BAO-100': product('REP-BAO-100', 790, 'low'),
    'REP-CAC-100': product('REP-CAC-100', 1290, 'out'),
  },
};

const cart = (lines: CartState['lines'], delivery?: Delivery): CartState => ({
  ...emptyCart(new Date('2026-11-01T00:00:00Z')),
  lines,
  ...(delivery ? { delivery } : {}),
});

describe('shippingAmount', () => {
  it('is free at and above the threshold, paid below, never free when disabled', () => {
    expect(shippingAmount(490, 4899, 4900)).toBe(490);
    expect(shippingAmount(490, 4900, 4900)).toBe(0);
    expect(shippingAmount(490, 10000, 4900)).toBe(0);
    expect(shippingAmount(490, 10000, null)).toBe(490);
  });
});

describe('computeTotals', () => {
  it('an empty cart', () => {
    const t = computeTotals(cart([]), catalog);
    expect(t).toMatchObject({
      lines: [],
      itemCount: 0,
      subtotal: 0,
      shipping: null,
      total: 0,
      freeShippingGap: 4900,
      freeShippingProgress: 0,
      freeShipping: false,
      orderable: false,
    });
  });

  it('subtotal, item count, line totals in integer cents', () => {
    const t = computeTotals(
      cart([
        { sku: 'REP-MOR-100', quantity: 2 },
        { sku: 'REP-BAO-100', quantity: 1 },
      ]),
      catalog,
    );
    expect(t.lines.map((l) => [l.sku, l.lineTotal])).toEqual([
      ['REP-MOR-100', 1780],
      ['REP-BAO-100', 790],
    ]);
    expect(t.subtotal).toBe(2570);
    expect(t.itemCount).toBe(3);
    expect(t.freeShippingGap).toBe(2330);
    expect(t.freeShippingProgress).toBeCloseTo(2570 / 4900);
    expect(t.shipping).toBeNull();
    expect(t.total).toBe(2570);
    expect(t.orderable).toBe(true);
  });

  it('adds the selected method below the threshold', () => {
    const lines = [{ sku: 'REP-MOR-100', quantity: 1 }];
    expect(computeTotals(cart(lines, { method: 'home' }), catalog)).toMatchObject({
      shippingMethod: 'home',
      shipping: 690,
      total: 890 + 690,
    });
    expect(computeTotals(cart(lines, { method: 'pickup' }), catalog)).toMatchObject({
      shipping: 0,
      total: 890,
    });
  });

  it('ships free exactly at the threshold and above', () => {
    // A product priced at the threshold gives a subtotal of exactly 4900.
    const exact = {
      ...catalog,
      products: { ...catalog.products, 'REP-X-1': product('REP-X-1', 4900) },
    };
    const atThreshold = computeTotals(
      cart([{ sku: 'REP-X-1', quantity: 1 }], { method: 'home' }),
      exact,
    );
    expect(atThreshold).toMatchObject({
      subtotal: 4900,
      shipping: 0,
      total: 4900,
      freeShippingGap: 0,
      freeShippingProgress: 1,
      freeShipping: true,
    });
    const justBelow = computeTotals(cart([{ sku: 'REP-X-1', quantity: 1 }], { method: 'home' }), {
      ...exact,
      freeShippingFrom: 4901,
    });
    expect(justBelow).toMatchObject({ shipping: 690, freeShippingGap: 1, freeShipping: false });
    const above = computeTotals(
      cart([{ sku: 'REP-MOR-100', quantity: 6 }], { method: 'relay', relay: relayPoint() }),
      catalog,
    );
    expect(above).toMatchObject({ subtotal: 5340, shipping: 0, total: 5340, freeShippingGap: 0 });
  });

  it('never ships free when the threshold is disabled', () => {
    const t = computeTotals(cart([{ sku: 'REP-MOR-100', quantity: 10 }], { method: 'home' }), {
      ...catalog,
      freeShippingFrom: null,
    });
    expect(t).toMatchObject({
      shipping: 690,
      total: 8900 + 690,
      freeShippingGap: null,
      freeShippingProgress: null,
      freeShipping: false,
    });
  });

  it('reports unknown and out-of-stock SKUs and blocks the order', () => {
    const t = computeTotals(
      cart([
        { sku: 'REP-MOR-100', quantity: 1 },
        { sku: 'REP-GONE-1', quantity: 2 },
        { sku: 'REP-CAC-100', quantity: 1 },
      ]),
      catalog,
    );
    expect(t.unknownSkus).toEqual(['REP-GONE-1']);
    expect(t.outOfStockSkus).toEqual(['REP-CAC-100']);
    expect(t.lines.map((l) => l.sku)).toEqual(['REP-MOR-100', 'REP-CAC-100']);
    expect(t.lines[1]!.outOfStock).toBe(true);
    expect(t.subtotal).toBe(890 + 1290);
    expect(t.itemCount).toBe(2);
    expect(t.orderable).toBe(false);
  });

  it('flags a selected method that is no longer enabled', () => {
    const t = computeTotals(cart([{ sku: 'REP-MOR-100', quantity: 1 }], { method: 'home' }), {
      ...catalog,
      shipping: catalog.shipping.filter((s) => s.id !== 'home'),
    });
    expect(t).toMatchObject({
      shippingMethod: null,
      shipping: null,
      shippingUnavailable: true,
      orderable: false,
    });
  });

  it('is not orderable while the shop is closed', () => {
    const t = computeTotals(cart([{ sku: 'REP-MOR-100', quantity: 1 }]), {
      ...catalog,
      shopOpen: false,
    });
    expect(t.orderable).toBe(false);
  });
});

function relayPoint() {
  return {
    id: 'FR-016741',
    name: 'Tabac',
    address1: '1 rue',
    postcode: '95400',
    city: 'Arnouville',
    country: 'FR',
  };
}
