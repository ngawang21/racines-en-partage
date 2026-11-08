import { describe, expect, it } from 'vitest';
import type { ClientProduct } from '../../src/catalog/build';
import { buildIndex, normalise, search } from '../../src/search/match';

const product = (
  sku: string,
  name: string,
  categoryName: string,
  keywords: string[] = [],
): ClientProduct => ({
  sku,
  slug: sku.toLowerCase(),
  url: `/produits/${sku.toLowerCase()}/`,
  name,
  weightGrams: 100,
  unitAmount: 890,
  stock: 'in_stock',
  image: '/thumb.webp',
  category: categoryName.toLowerCase(),
  categoryName,
  keywords,
  related: [],
  featured: false,
});

const catalog = {
  products: Object.fromEntries(
    [
      product('MOR-100', 'Poudre de moringa 100 g', 'Poudres'),
      product('MOR-200', 'Poudre de moringa 200 g', 'Poudres'),
      product('HIB-100', 'Fleurs d’hibiscus (bissap) 100 g', 'Tisanes', ['bissap', 'karkadé']),
      product('SOU-200', 'Tubercules de souchet 200 g', 'Graines', ['chufa', 'tchongon']),
      product('ORG-100', 'Poudre d’orge grillée 100 g', 'Poudres', ['tsampa']),
      product('CAC-100', 'Poudre de cacao 100 g', 'Cacao'),
    ].map((p) => [p.sku, p]),
  ),
};
const index = buildIndex(catalog);
const skus = (q: string, limit?: number) => search(index, q, limit).map((p) => p.sku);

describe('normalise', () => {
  it('folds case, accents, ligatures and punctuation', () => {
    expect(normalise('Fleurs d’Hibiscus (bissap)')).toBe('fleurs d hibiscus bissap');
    expect(normalise('KARKADÉ')).toBe('karkade');
    expect(normalise('  Œufs  ')).toBe('oeufs');
  });
});

describe('search', () => {
  it('matches a word prefix of the name', () => {
    expect(skus('mori')).toEqual(['MOR-100', 'MOR-200']);
    expect(skus('hibis')).toEqual(['HIB-100']);
  });
  it('ignores accents in the query and in the catalogue', () => {
    expect(skus('grillee')).toEqual(['ORG-100']);
    expect(skus('karkade')).toEqual(['HIB-100']);
    expect(skus('Karkadé')).toEqual(['HIB-100']);
  });
  it('matches keywords and the category name', () => {
    expect(skus('chufa')).toEqual(['SOU-200']);
    expect(skus('tsampa')).toEqual(['ORG-100']);
    expect(skus('tisane')).toEqual(['HIB-100']);
    expect(skus('graines')).toEqual(['SOU-200']);
  });
  it('needs every word of the query', () => {
    expect(skus('poudre moringa 200')).toEqual(['MOR-200']);
    expect(skus('moringa cacao')).toEqual([]);
  });
  it('does not match inside a word', () => {
    expect(skus('inga')).toEqual([]);
  });
  it('ranks name matches before category matches', () => {
    // "cacao" is the name of CAC-100 and its category.
    expect(skus('cacao')[0]).toBe('CAC-100');
    // "poudre" starts the name of four products, all ahead of nothing else.
    expect(skus('poudre')).toEqual(['MOR-100', 'MOR-200', 'ORG-100', 'CAC-100']);
  });
  it('returns nothing for an empty or blank query and honours the limit', () => {
    expect(skus('')).toEqual([]);
    expect(skus('  ’ ')).toEqual([]);
    expect(skus('poudre', 2)).toEqual(['MOR-100', 'MOR-200']);
  });
});
