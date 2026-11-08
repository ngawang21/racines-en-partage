import { describe, expect, it } from 'vitest';
import type { ClientProduct } from '../../src/catalog/build';
import { linesToCart } from '../../src/cart/reorder';

const product = (sku: string, stock: ClientProduct['stock'] = 'in_stock'): ClientProduct => ({
  sku,
  slug: sku.toLowerCase(),
  url: `/produits/${sku.toLowerCase()}/`,
  name: `Produit ${sku} 100 g`,
  weightGrams: 100,
  unitAmount: 890,
  stock,
  image: `/_astro/${sku}.webp`,
  category: 'poudres',
  categoryName: 'Poudres',
  keywords: [],
  related: [],
  featured: false,
});
const catalog = {
  products: Object.fromEntries(
    [product('MOR'), product('BAO', 'low'), product('CAC', 'out')].map((p) => [p.sku, p]),
  ),
};
const line = (sku: string | undefined, quantity: number, name = `Ancien ${sku}`) => ({
  sku,
  name,
  quantity,
});

describe('linesToCart', () => {
  it('brings back every line still in the catalogue, low stock included, in order', () => {
    expect(linesToCart({ lines: [line('BAO', 2), line('MOR', 1)] }, catalog, 10)).toEqual({
      lines: [
        { sku: 'BAO', quantity: 2 },
        { sku: 'MOR', quantity: 1 },
      ],
      unavailable: [],
      capped: false,
    });
  });

  it('caps each quantity at the per-line maximum and merges repeated SKUs', () => {
    expect(linesToCart({ lines: [line('MOR', 7), line('MOR', 5)] }, catalog, 10).lines).toEqual([
      { sku: 'MOR', quantity: 10 },
    ]);
    expect(linesToCart({ lines: [line('MOR', 30)] }, catalog, 10).lines).toEqual([
      { sku: 'MOR', quantity: 10 },
    ]);
  });

  it('says when a quantity was capped (C4: a capped reorder is not announced as a full one)', () => {
    expect(linesToCart({ lines: [line('MOR', 7), line('MOR', 5)] }, catalog, 10).capped).toBe(true);
    expect(linesToCart({ lines: [line('MOR', 30)] }, catalog, 10).capped).toBe(true);
    expect(linesToCart({ lines: [line('MOR', 10)] }, catalog, 10).capped).toBe(false);
  });

  it('names the products that cannot come back: out of stock, unknown or without a SKU', () => {
    const pick = linesToCart(
      {
        lines: [
          line('CAC', 1),
          line('GONE', 2, 'Poudre disparue 100 g'),
          line(undefined, 1, 'Sans référence'),
          line('GONE', 1, 'Poudre disparue 100 g'),
          line('MOR', 1),
        ],
      },
      catalog,
      10,
    );
    expect(pick.lines).toEqual([{ sku: 'MOR', quantity: 1 }]);
    // An out-of-stock product keeps its current name; a gone one its ordered name.
    expect(pick.unavailable).toEqual([
      'Produit CAC 100 g',
      'Poudre disparue 100 g',
      'Sans référence',
    ]);
  });

  it('ignores empty or malformed quantities and tolerates odd SKUs', () => {
    const pick = linesToCart(
      { lines: [line('MOR', 0), line('MOR', -2), line('MOR', 1.5), line('constructor', 1, 'X')] },
      catalog,
      10,
    );
    expect(pick).toEqual({ lines: [], unavailable: ['X'], capped: false });
  });

  it('an empty order picks nothing', () => {
    expect(linesToCart({ lines: [] }, catalog, 10)).toEqual({
      lines: [],
      unavailable: [],
      capped: false,
    });
  });
});
