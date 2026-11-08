import { describe, expect, it } from 'vitest';
import type { ClientProduct } from '../../src/catalog/build';
import { pickCrossSell } from '../../src/cart/cross-sell';

const product = (
  sku: string,
  opts: Partial<Pick<ClientProduct, 'stock' | 'related' | 'featured'>> = {},
): ClientProduct => ({
  sku,
  slug: sku.toLowerCase(),
  url: `/produits/${sku.toLowerCase()}/`,
  name: `${sku} 100 g`,
  weightGrams: 100,
  unitAmount: 890,
  stock: opts.stock ?? 'in_stock',
  image: `/_astro/${sku}.webp`,
  category: 'poudres',
  categoryName: 'Poudres',
  keywords: [],
  related: opts.related ?? [],
  featured: opts.featured ?? false,
});

const catalogOf = (...list: ClientProduct[]) => ({
  products: Object.fromEntries(list.map((p) => [p.sku, p])),
});

const skus = (list: ClientProduct[]) => list.map((p) => p.sku);
const line = (sku: string) => ({ sku, quantity: 1 });

describe('pickCrossSell', () => {
  const catalog = catalogOf(
    product('MOR', { related: ['BAO', 'HIB'] }),
    product('BAO', { related: ['MOR', 'CAC'] }),
    product('HIB', { related: ['MOR'] }),
    product('CAC', { featured: true }),
    product('SOU', { featured: true }),
    product('OUT', { stock: 'out', featured: true }),
    product('LOW', { stock: 'low' }),
  );

  it('suggests nothing for an empty cart', () => {
    expect(pickCrossSell([], catalog)).toEqual([]);
  });

  it('takes the related products of the lines first, in cart then list order', () => {
    expect(skus(pickCrossSell([line('MOR')], catalog))).toEqual(['BAO', 'HIB']);
    expect(skus(pickCrossSell([line('HIB'), line('BAO')], catalog))).toEqual(['MOR', 'CAC']);
  });

  it('never suggests a product already in the cart', () => {
    expect(skus(pickCrossSell([line('MOR'), line('BAO')], catalog))).toEqual(['HIB', 'CAC']);
  });

  it('completes with the featured products in catalogue order', () => {
    expect(skus(pickCrossSell([line('HIB')], catalog))).toEqual(['MOR', 'CAC']);
    expect(skus(pickCrossSell([line('SOU')], catalog))).toEqual(['CAC']);
    expect(skus(pickCrossSell([line('LOW')], catalog, 3))).toEqual(['CAC', 'SOU']);
  });

  it('skips out-of-stock and unknown (hidden or removed) products, keeps low stock', () => {
    const c = catalogOf(
      product('A', { related: ['GONE', 'OUT', 'LOW'] }),
      product('OUT', { stock: 'out' }),
      product('LOW', { stock: 'low' }),
    );
    expect(skus(pickCrossSell([line('A')], c))).toEqual(['LOW']);
  });

  it('tolerates a line whose product left the catalogue', () => {
    expect(skus(pickCrossSell([line('GONE')], catalog))).toEqual(['CAC', 'SOU']);
  });

  it('respects max, defaulting to two, and returns each product once', () => {
    const lines = [line('MOR'), line('BAO'), line('HIB')];
    expect(pickCrossSell(lines, catalog)).toHaveLength(2);
    expect(skus(pickCrossSell([line('MOR')], catalog, 1))).toEqual(['BAO']);
    expect(pickCrossSell([line('MOR')], catalog, 0)).toEqual([]);
    const all = skus(pickCrossSell([line('MOR'), line('HIB')], catalog, 10));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(['BAO', 'CAC', 'SOU']);
  });

  it('is stable: the same cart gives the same suggestions', () => {
    const lines = [line('BAO')];
    expect(skus(pickCrossSell(lines, catalog))).toEqual(skus(pickCrossSell(lines, catalog)));
  });
});
