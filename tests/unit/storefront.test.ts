import { describe, expect, it } from 'vitest';
import {
  formatsOf,
  mergeProduct,
  publishedReviews,
  reviewStats,
  reviewsFor,
} from '../../src/content/merge';
import type { Product, Review } from '../../src/content/schemas';
import { yamlFolder } from './helpers';

const fr = yamlFolder('products', 'fr');
const all = [...fr].map(([slug, raw]) => mergeProduct(slug, raw));

/** A minimal product built from a real one, so the test does not hang on the catalogue. */
const base = all[0]!;
const make = (slug: string, name: string, weightGrams: number, category = 'poudres'): Product => ({
  ...base,
  slug,
  sku: slug.toUpperCase(),
  name,
  weightGrams,
  category,
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
