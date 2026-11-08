import { describe, expect, it } from 'vitest';
import type { ClientProduct } from '../../src/catalog/build';
import { formatFamily, pickCrossSell } from '../../src/cart/cross-sell';

const product = (
  sku: string,
  opts: Partial<Pick<ClientProduct, 'stock' | 'related' | 'featured' | 'slug' | 'category'>> = {},
): ClientProduct => ({
  sku,
  slug: opts.slug ?? sku.toLowerCase(),
  url: `/produits/${sku.toLowerCase()}/`,
  name: `${sku} 100 g`,
  weightGrams: 100,
  unitAmount: 890,
  stock: opts.stock ?? 'in_stock',
  image: `/_astro/${sku}.webp`,
  category: opts.category ?? 'poudres',
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

describe('formatFamily', () => {
  it('drops the trailing weight of the slug, within the category', () => {
    const fam = (slug: string, category = 'poudres') => formatFamily({ slug, category });
    expect(fam('poudre-de-moringa-100g')).toBe(fam('poudre-de-moringa-200g'));
    expect(fam('poudre-de-moringa-1kg')).toBe(fam('poudre-de-moringa-100g'));
    expect(fam('poudre-de-moringa-100g')).not.toBe(fam('poudre-de-baobab-100g'));
    expect(fam('poudre-de-souchet-100g')).not.toBe(fam('tubercules-de-souchet-200g', 'graines'));
    expect(fam('poudre-de-cacao-100g', 'cacao')).not.toBe(fam('grues-de-cacao-100g', 'cacao'));
    expect(fam('sans-poids')).toBe('poudres/sans-poids');
  });
});

describe('pickCrossSell: formats and complements (review 11)', () => {
  // The shape of the real catalogue: moringa and baobab in two formats.
  const shop = catalogOf(
    product('MOR-100', {
      slug: 'poudre-de-moringa-100g',
      related: ['MOR-200', 'BAO-100'],
      featured: true,
    }),
    product('MOR-200', {
      slug: 'poudre-de-moringa-200g',
      related: ['MOR-100', 'ORG-100'],
    }),
    product('BAO-100', {
      slug: 'poudre-de-baobab-100g',
      related: ['BAO-200', 'HIB-100', 'MOR-100'],
      featured: true,
    }),
    product('BAO-200', { slug: 'poudre-de-baobab-200g', related: ['BAO-100', 'MOR-200'] }),
    product('ORG-100', { slug: 'poudre-d-orge-grillee-100g' }),
    product('HIB-100', {
      slug: 'fleurs-d-hibiscus-bissap-100g',
      category: 'infusions',
      related: ['BAO-100', 'SOU-200'],
      featured: true,
    }),
    product('SOU-200', {
      slug: 'tubercules-de-souchet-200g',
      category: 'graines',
      related: ['HIB-100'],
      featured: true,
    }),
    product('CAC-100', { slug: 'poudre-de-cacao-100g', category: 'cacao' }),
  );

  it('never suggests another format of a product in the cart', () => {
    for (const sku of ['MOR-100', 'MOR-200', 'BAO-100', 'BAO-200']) {
      const family = formatFamily(shop.products[sku]!);
      const picks = pickCrossSell([line(sku)], shop, 10);
      expect(picks.map(formatFamily)).not.toContain(family);
    }
  });

  it('suggests one format per product', () => {
    const picks = pickCrossSell([line('ORG-100')], shop, 10);
    const families = picks.map(formatFamily);
    expect(new Set(families).size).toBe(families.length);
  });

  it('puts products of another category first, then the siblings', () => {
    // Moringa 100 g: its related list gives baobab (same category) only; the
    // featured hibiscus and tiger nuts are complements and come first.
    expect(skus(pickCrossSell([line('MOR-100')], shop))).toEqual(['HIB-100', 'SOU-200']);
    expect(skus(pickCrossSell([line('MOR-100')], shop, 4))).toEqual([
      'HIB-100',
      'SOU-200',
      'BAO-100',
    ]);
    // Hibiscus: baobab (another category) and tiger nuts, in the related order.
    expect(skus(pickCrossSell([line('HIB-100')], shop))).toEqual(['BAO-100', 'SOU-200']);
  });

  it('keeps the related order inside each group', () => {
    expect(skus(pickCrossSell([line('BAO-200')], shop, 4))).toEqual([
      'HIB-100',
      'SOU-200',
      'MOR-200',
    ]);
  });

  it('falls back to siblings when no complement is left', () => {
    const c = catalogOf(
      product('A-100', { slug: 'a-100g', related: ['A-200', 'B-100'] }),
      product('A-200', { slug: 'a-200g' }),
      product('B-100', { slug: 'b-100g' }),
    );
    expect(skus(pickCrossSell([line('A-100')], c))).toEqual(['B-100']);
  });
});
