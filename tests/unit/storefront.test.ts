import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CARD_POUCH,
  GRID_RANGES,
  POUCH_BOXES,
  balancedColumns,
  gridColumnsStyle,
  originCountry,
  pouchCrop,
} from '../../src/components/storefront';
import {
  compareProducts,
  featuredFirst,
  formatFamilies,
  formatsOf,
  groupFormats,
  mergeProduct,
  publishedReviews,
  relatedProducts,
  reviewStats,
  reviewsFor,
} from '../../src/content/merge';
import type { Product, Review } from '../../src/content/schemas';
import { yamlFolder } from './helpers';

const fr = yamlFolder('products', 'fr');
const all = [...fr].map(([slug, raw]) => mergeProduct(slug, raw));

/** A minimal product built from a real one, so the test does not hang on the catalogue. */
const base = all[0]!;
const make = (
  slug: string,
  name: string,
  weightGrams: number,
  category = 'poudres',
  over: Partial<Product> = {},
): Product => ({
  ...base,
  slug,
  sku: slug.toUpperCase(),
  name,
  weightGrams,
  category,
  featured: false,
  related: [],
  ...over,
});

const review = (over: Partial<Review>): Review => ({
  id: 'r',
  product: 'a',
  rating: 5,
  author: 'Awa',
  locale: 'fr',
  date: '2026-11-01',
  order: '',
  verified: false,
  published: true,
  title: '',
  text: 'Un vrai goût de feuille, très doux.',
  reply: '',
  ...over,
});

describe('formatsOf', () => {
  const a100 = make('a-100', 'Poudre de moringa', 100);
  const a200 = make('a-200', 'Poudre de moringa', 200);
  const a50 = make('a-50', 'Poudre de moringa ', 50);
  const other = make('b-100', 'Poudre de baobab', 100);
  const elsewhere = make('c-100', 'Poudre de moringa', 100, 'tisanes');
  const list = [a200, other, a100, elsewhere, a50];

  it('groups same name and category, lightest first, the product included', () => {
    expect(formatsOf(a200, list).map((p) => p.slug)).toEqual(['a-50', 'a-100', 'a-200']);
    expect(formatsOf(a100, list).map((p) => p.slug)).toEqual(['a-50', 'a-100', 'a-200']);
  });
  it('returns the product alone when it has no other format', () => {
    expect(formatsOf(other, list)).toEqual([other]);
    expect(formatsOf(elsewhere, list)).toEqual([elsewhere]);
  });
  it('finds the families of the real catalogue', () => {
    for (const p of all) {
      const family = formatsOf(p, all);
      expect(family[0]!.weightGrams).toBeLessThanOrEqual(family.at(-1)!.weightGrams);
      expect(family).toContain(p);
      expect(new Set(family.map((f) => f.category))).toEqual(new Set([p.category]));
    }
  });
});

describe('formatFamilies and groupFormats', () => {
  const m100 = make('m-100', 'Poudre de moringa', 100);
  const m200 = make('m-200', 'Poudre de moringa', 200);
  const b100 = make('b-100', 'Poudre de baobab', 100);
  const b200 = make('b-200', 'Poudre de baobab', 200);
  const hib = make('hib', 'Fleurs d’hibiscus', 100, 'infusions');
  const list = [m200, b100, hib, m100, b200];

  it('maps every slug to the lightest format of its family', () => {
    const families = formatFamilies(list);
    expect(families.get('m-200')).toBe('m-100');
    expect(families.get('m-100')).toBe('m-100');
    expect(families.get('b-200')).toBe('b-100');
    expect(families.get('hib')).toBe('hib');
  });
  it('makes one group per family, in the order first met, led by the lightest', () => {
    const groups = groupFormats(list);
    expect(groups.map((g) => g.lead.slug)).toEqual(['m-100', 'b-100', 'hib']);
    expect(groups.map((g) => g.formats.map((f) => f.slug))).toEqual([
      ['m-100', 'm-200'],
      ['b-100', 'b-200'],
      ['hib'],
    ]);
  });
  it('takes the formats from the whole catalogue (a home selection of one format)', () => {
    const groups = groupFormats([m100, hib], list);
    expect(groups.map((g) => g.formats.length)).toEqual([2, 1]);
    expect(groupFormats([m200], list)[0]!.lead).toBe(m100);
  });
  it('groups by the French families whatever the names of the locale', () => {
    const families = formatFamilies(list);
    const en = list.map((p) => ({ ...p, name: `${p.name} ${p.weightGrams}` }));
    expect(groupFormats(en, en, families).map((g) => g.formats.length)).toEqual([2, 2, 1]);
  });
  it('keeps a product missing from the catalogue as its own card', () => {
    const lone = make('lone', 'Seul', 50);
    expect(groupFormats([lone], list)).toEqual([{ lead: lone, formats: [lone] }]);
  });
  it('makes 9 cards of the 11 products of the real catalogue', () => {
    const groups = groupFormats(all);
    expect(groups).toHaveLength(9);
    expect(groups.flatMap((g) => g.formats)).toHaveLength(all.length);
    for (const g of groups) expect(g.lead).toBe(g.formats[0]);
  });
});

describe('relatedProducts', () => {
  const m100 = make('m-100', 'Poudre de moringa', 100, 'poudres', { related: ['m-200', 'b-200'] });
  const m200 = make('m-200', 'Poudre de moringa', 200);
  const b100 = make('b-100', 'Poudre de baobab', 100);
  const b200 = make('b-200', 'Poudre de baobab', 200);
  const orge = make('orge', 'Poudre d’orge', 100);
  const hib = make('hib', 'Fleurs d’hibiscus', 100, 'infusions', { featured: true });
  const cacao = make('cacao', 'Poudre de cacao', 100, 'cacao');
  const nibs = make('nibs', 'Grués de cacao', 100, 'cacao', { featured: true });
  const list = [orge, b100, b200, m100, m200, hib, cacao, nibs];

  it('never lists a format of the product, and one format per other product', () => {
    const slugs = relatedProducts(m100, list).map((p) => p.slug);
    expect(slugs).not.toContain('m-100');
    expect(slugs).not.toContain('m-200');
    expect(slugs.filter((s) => s.startsWith('b-'))).toEqual(['b-100']);
  });
  it('fills four: related links, same category, then featured products elsewhere', () => {
    expect(relatedProducts(m100, list).map((p) => p.slug)).toEqual([
      'b-100',
      'orge',
      'hib',
      'nibs',
    ]);
    expect(relatedProducts(m200, list).map((p) => p.slug)).toEqual([
      'orge',
      'b-100',
      'hib',
      'nibs',
    ]);
  });
  it('falls back to the rest of the catalogue when the featured ones run out', () => {
    expect(relatedProducts(hib, list).map((p) => p.slug)).toEqual([
      'nibs',
      'orge',
      'b-100',
      'm-100',
    ]);
  });
  it('gives four distinct families for every product of the real catalogue', () => {
    const families = formatFamilies(all);
    for (const p of all) {
      const related = relatedProducts(p, all, families);
      expect(related, p.slug).toHaveLength(4);
      const keys = related.map((r) => families.get(r.slug));
      expect(new Set(keys).size, p.slug).toBe(4);
      expect(keys, p.slug).not.toContain(families.get(p.slug));
      for (const r of related) expect(families.get(r.slug), p.slug).toBe(r.slug);
    }
  });
});

describe('originCountry', () => {
  it('keeps the country of an origin line', () => {
    expect(originCountry('Allemagne, Sonam’Tsampa')).toBe('Allemagne');
    expect(originCountry('Germany, Sonam’Tsampa')).toBe('Germany');
    expect(originCountry('Côte d’Ivoire')).toBe('Côte d’Ivoire');
    expect(originCountry(' Niger ')).toBe('Niger');
  });
});

describe('pouchCrop', () => {
  const frameH = 5 / 4;
  const photoH = 1600 / 1067;
  it('puts every measured pouch at the same place and scale in a 4:5 card', () => {
    for (const [name, box] of Object.entries(POUCH_BOXES)) {
      const crop = pouchCrop(`/src/assets/products/${name}.webp`)!;
      expect(crop.scale, name).toBeGreaterThanOrEqual(1);
      expect(crop.offset, name).toBeLessThanOrEqual(0);
      // The photo covers the frame.
      expect(crop.offset + photoH * crop.scale, name).toBeGreaterThanOrEqual(frameH - 0.002);
      const top = (crop.offset + box.top * photoH * crop.scale) / frameH;
      const height = ((box.bottom - box.top) * photoH * crop.scale) / frameH;
      expect(top, name).toBeCloseTo(CARD_POUCH.top, 2);
      expect(height, name).toBeCloseTo(CARD_POUCH.height, 2);
    }
  });
  it('measures every product photo of the catalogue', () => {
    for (const p of all) {
      const file = p.images[0]!;
      expect(existsSync(join(process.cwd(), file.slice(1))), file).toBe(true);
      expect(pouchCrop(file), file).not.toBeNull();
    }
  });
  it('leaves an unmeasured photo to the default crop', () => {
    expect(pouchCrop('/src/assets/products/new-product.webp')).toBeNull();
  });
});

describe('reviewStats', () => {
  it('is zero for no review', () => {
    expect(reviewStats([])).toEqual({ count: 0, average: 0 });
  });
  it('averages to one decimal', () => {
    expect(reviewStats([{ rating: 5 }, { rating: 4 }])).toEqual({ count: 2, average: 4.5 });
    expect(reviewStats([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({
      count: 3,
      average: 4.3,
    });
    expect(reviewStats([{ rating: 5 }, { rating: 5 }, { rating: 4 }])).toEqual({
      count: 3,
      average: 4.7,
    });
    expect(reviewStats([{ rating: 3 }])).toEqual({ count: 1, average: 3 });
  });
});

describe('publishedReviews and reviewsFor', () => {
  const list = [
    review({ id: 'old', product: 'a', date: '2026-10-01' }),
    review({ id: 'draft', product: 'a', date: '2026-11-05', published: false }),
    review({ id: 'new', product: 'a', date: '2026-11-04' }),
    review({ id: 'hidden', product: 'gone', date: '2026-11-06' }),
    review({ id: 'b', product: 'b', date: '2026-11-03', locale: 'en' }),
  ];
  const shown = publishedReviews(list, new Set(['a', 'b']));
  it('keeps published reviews of shown products, newest first', () => {
    expect(shown.map((r) => r.id)).toEqual(['new', 'b', 'old']);
  });
  it('shows none when the owner turned reviews off', () => {
    expect(publishedReviews(list, new Set(['a', 'b']), false)).toEqual([]);
    expect(publishedReviews(list, new Set(['a', 'b']), true)).toEqual(shown);
  });
  it('filters one product, keeping the order', () => {
    expect(reviewsFor('a', shown).map((r) => r.id)).toEqual(['new', 'old']);
    expect(reviewsFor('zzz', shown)).toEqual([]);
  });
});

describe('featuredFirst (the shop default order)', () => {
  const categoryOrder = new Map(
    [...yamlFolder('categories', 'fr')].map(([slug, raw]) => [
      slug,
      (raw as { order: number }).order,
    ]),
  );
  const catalogue = [...all].sort(compareProducts(categoryOrder, 'fr'));
  it('opens on the home selection, in the home order, then the catalogue', () => {
    const shop = featuredFirst(catalogue);
    const home = catalogue.filter((p) => p.featured);
    expect(shop.slice(0, home.length)).toEqual(home);
    expect(shop.slice(home.length)).toEqual(catalogue.filter((p) => !p.featured));
    // One card per family: the featured families lead the grid.
    const leads = groupFormats(shop, all, formatFamilies(all)).map((g) => g.lead.slug);
    expect(leads.slice(0, 4)).toEqual([
      'poudre-de-baobab-100g',
      'poudre-de-moringa-100g',
      'fleurs-d-hibiscus-bissap-100g',
      'tubercules-de-souchet-200g',
    ]);
    expect(leads[0]).not.toBe('poudre-d-orge-grillee-100g');
  });
  it('keeps the order within each part', () => {
    const list = [
      make('a', 'A', 100),
      make('b', 'B', 100, 'poudres', { featured: true }),
      make('c', 'C', 100),
      make('d', 'D', 100, 'poudres', { featured: true }),
    ];
    expect(featuredFirst(list).map((p) => p.slug)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('balancedColumns', () => {
  const lone = (count: number, columns: number) => count > columns && count % columns === 1;
  it('never leaves a lone last card when the range allows another count', () => {
    for (let count = 1; count <= 16; count += 1) {
      for (const range of Object.values(GRID_RANGES)) {
        const columns = balancedColumns(count, range);
        expect(columns).toBeGreaterThanOrEqual(range.min);
        expect(columns).toBeLessThanOrEqual(range.max);
        const avoidable = [range.preferred, range.preferred + 1, range.preferred - 1].some(
          (c) => c >= range.min && c <= range.max && !lone(count, c),
        );
        if (avoidable) expect(lone(count, columns), `${count} in ${columns}`).toBe(false);
      }
    }
  });
  it('shop (nine cards): three rows of three, then five and four from 1280 px', () => {
    expect(gridColumnsStyle(9)).toBe('--cols-md: 3; --cols-lg: 3; --cols-xl: 5; --cols-xxl: 5');
  });
  it('a category of four: two rows of two, then one row of four', () => {
    expect(gridColumnsStyle(4)).toBe('--cols-md: 2; --cols-lg: 4; --cols-xl: 4; --cols-xxl: 5');
  });
  it('keeps the preferred count for a single row and for counts that already balance', () => {
    expect(gridColumnsStyle(2)).toBe('--cols-md: 3; --cols-lg: 3; --cols-xl: 4; --cols-xxl: 5');
    expect(gridColumnsStyle(8)).toBe('--cols-md: 3; --cols-lg: 3; --cols-xl: 4; --cols-xxl: 5');
    expect(balancedColumns(6, GRID_RANGES.xxl)).toBe(4);
  });
});
