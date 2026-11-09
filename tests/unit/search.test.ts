import { describe, expect, it } from 'vitest';
import type { ClientProduct } from '../../src/catalog/build';
import { formatFamilies } from '../../src/content/formats';
import {
  bareName,
  buildIndex,
  groupRows,
  nearPrefix,
  normalise,
  search,
  searchGroups,
} from '../../src/search/match';

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
      product('HIB-100', 'Fleurs d’hibiscus (bissap) 100 g', 'Tisanes', [
        'bissap',
        'karkadé',
        'thé',
        'infusion',
      ]),
      product('SOU-200', 'Tubercules de souchet 200 g', 'Graines', [
        'chufa',
        'tchongon',
        'lait végétal',
      ]),
      product('ORG-100', 'Poudre d’orge grillée 100 g', 'Poudres', ['tsampa']),
      product('CAC-100', 'Poudre de cacao 100 g', 'Cacao', ['chocolat']),
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
    expect(skus('poudre', Number.POSITIVE_INFINITY)).toHaveLength(4);
  });
  it('folds accents both ways: an accent typed or left out', () => {
    expect(skus('hibíscus')).toEqual(['HIB-100']);
    expect(skus('the')).toEqual(['HIB-100']);
    expect(skus('thé')).toEqual(['HIB-100']);
  });
  it('finds products through their keywords (synonyms)', () => {
    expect(skus('infusion')).toEqual(['HIB-100']);
    expect(skus('chocolat')).toEqual(['CAC-100']);
    expect(skus('lait')).toEqual(['SOU-200']);
  });
  it('forgives one typo per word of four letters or more', () => {
    expect(skus('hibicus')).toEqual(['HIB-100']);
    expect(skus('moringua')).toEqual(['MOR-100', 'MOR-200']);
    expect(skus('cacoa')).toEqual(['CAC-100']);
    expect(skus('poudre moringua 200')).toEqual(['MOR-200']);
    // Two typos, or a typo in a short word, find nothing.
    expect(skus('hibicuss')).toEqual([]);
    expect(skus('hibcuss')).toEqual([]);
    expect(skus('thx')).toEqual([]);
  });
  it('keeps typo matches out when the query matches exactly', () => {
    // "poudr" starts four names exactly; no near miss joins them.
    expect(skus('poudr')).toEqual(['MOR-100', 'MOR-200', 'ORG-100', 'CAC-100']);
  });
});

describe('nearPrefix', () => {
  it('accepts one insertion, deletion, substitution or swap against a word or its start', () => {
    expect(nearPrefix('hibicus', 'hibiscus')).toBe(true);
    expect(nearPrefix('moringua', 'moringa')).toBe(true);
    expect(nearPrefix('morinfa', 'moringa')).toBe(true);
    expect(nearPrefix('cacoa', 'cacao')).toBe(true);
    expect(nearPrefix('hibsi', 'hibiscus')).toBe(true);
    expect(nearPrefix('moringa', 'moringa')).toBe(true);
  });
  it('rejects two edits and words too short to hold the term', () => {
    expect(nearPrefix('hibcuss', 'hibiscus')).toBe(false);
    expect(nearPrefix('baobab', 'bissap')).toBe(false);
    expect(nearPrefix('moringaxx', 'moringa')).toBe(false);
  });
});

describe('searchGroups (one row per product, as in the grids)', () => {
  const sized = (sku: string, name: string, grams: number, keywords: string[] = []) => ({
    ...product(sku, `${name} ${grams}\u00a0g`, 'Poudres', keywords),
    weightGrams: grams,
    unitAmount: grams === 100 ? 600 : 1100,
  });
  // Catalogue order puts the 200 g first, so the row must still lead with the 100 g.
  const list = [
    sized('BAO-200', 'Poudre de baobab', 200),
    sized('BAO-100', 'Poudre de baobab', 100),
    sized('MOR-100', 'Poudre de moringa', 100),
    sized('MOR-200', 'Poudre de moringa', 200),
    sized('ORG-100', 'Poudre d’orge grillée', 100, ['tsampa']),
  ];
  const groupIndex = buildIndex({ products: Object.fromEntries(list.map((p) => [p.sku, p])) });
  // Families are defined on the French names without the weight (formatFamilies).
  const families = formatFamilies(list.map((p) => ({ ...p, name: bareName(p.name) })));
  const rows = (q: string, limit?: number) =>
    searchGroups(groupIndex, q, families, limit).map(
      (g) => `${g.shown.sku}:${g.formats.map((f) => f.sku).join('+')}`,
    );

  it('folds the formats of a product into one row showing the lightest', () => {
    expect(rows('baobab')).toEqual(['BAO-100:BAO-100+BAO-200']);
    expect(rows('poudre')).toEqual([
      'BAO-100:BAO-100+BAO-200',
      'MOR-100:MOR-100+MOR-200',
      'ORG-100:ORG-100',
    ]);
  });
  it('shows the format the query names, with every format still listed', () => {
    expect(rows('baobab 200')).toEqual(['BAO-200:BAO-100+BAO-200']);
    expect(rows('moringa 100')).toEqual(['MOR-100:MOR-100+MOR-200']);
  });
  it('counts and limits rows, not formats', () => {
    expect(rows('poudre', 2)).toHaveLength(2);
    expect(rows('poudre', 0)).toEqual([]);
    expect(rows('')).toEqual([]);
  });
  it('keeps a product without a family as its own row', () => {
    expect(searchGroups(groupIndex, 'tsampa', new Map())[0]!.formats).toHaveLength(1);
  });
  it('groups the suggestions the same way', () => {
    const featured = [list[0]!, list[2]!];
    expect(groupRows(featured, list, families).map((g) => [g.shown.sku, g.formats.length])).toEqual(
      [
        ['BAO-100', 2],
        ['MOR-100', 2],
      ],
    );
  });
  it('strips the weight from a catalogue name', () => {
    expect(bareName('Poudre de moringa 100\u00a0g')).toBe('Poudre de moringa');
    expect(bareName('Tiger nut powder 1.5\u00a0kg')).toBe('Tiger nut powder');
    expect(bareName('Poudre de cacao')).toBe('Poudre de cacao');
  });
});
