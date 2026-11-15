// Recipes with their own page (iteration 4, spec 2): every file parses
// strictly in both locales and names a real product, the merge falls back to
// French field by field, and the pure helpers pick, order and relate them.
import { describe, expect, it } from 'vitest';
import { formatFamilies } from '../../src/content/formats';
import {
  compareRecipes,
  mergeProduct,
  mergeRecipe,
  otherRecipes,
  publishedRecipes,
  recipesFor,
} from '../../src/content/merge';
import {
  recipeEntrySchema,
  recipeTranslationSchema,
  validateRecipes,
  type Product,
  type RecipeEntry,
} from '../../src/content/schemas';
import { assetExists, yamlFolder } from './helpers';

const frFiles = yamlFolder('recipes', 'fr');
const enFiles = yamlFolder('recipes', 'en');
const productFiles = yamlFolder('products', 'fr');
const products: Product[] = [...productFiles].map(([slug, raw]) => mergeProduct(slug, raw));
const families = formatFamilies(products);
const recipesFr = [...frFiles].map(([slug, raw]) => mergeRecipe(slug, raw));
const recipesEn = [...frFiles].map(([slug, raw]) =>
  mergeRecipe(slug, raw, enFiles.get(slug) ?? {}),
);

const LABEL_RECIPES = [
  'infusion-de-bissap',
  'boisson-fraiche-au-baobab',
  'smoothie-au-moringa',
  'horchata-de-souchet',
  'chocolat-chaud-maison',
];

const recipe = (slug: string, over: Partial<RecipeEntry> = {}): RecipeEntry => ({
  slug,
  hidden: false,
  product: 'poudre-de-moringa-100g',
  source: 'house',
  prepMinutes: 5,
  title: slug,
  summary: 'Résumé.',
  yield: '1 verre',
  ingredients: ['a'],
  steps: ['b'],
  tips: [],
  ...over,
});

describe('recipe files', () => {
  it('every French file is complete and every English file holds translated fields only', () => {
    expect(frFiles.size).toBeGreaterThanOrEqual(LABEL_RECIPES.length);
    for (const [slug, raw] of frFiles)
      expect(recipeEntrySchema.safeParse(raw).success, `fr/${slug}`).toBe(true);
    for (const [slug, raw] of enFiles) {
      expect(frFiles.has(slug), `en/${slug} has no French file`).toBe(true);
      expect(recipeTranslationSchema.safeParse(raw).success, `en/${slug}`).toBe(true);
    }
  });
  it('merges in both locales, English falling back to French', () => {
    expect(recipesEn).toHaveLength(recipesFr.length);
    for (const r of recipesEn) {
      const fr = recipesFr.find((f) => f.slug === r.slug)!;
      expect(r.product).toBe(fr.product);
      expect(r.prepMinutes).toBe(fr.prepMinutes);
      if (enFiles.has(r.slug)) expect(r.title, r.slug).not.toBe(fr.title);
    }
  });
  it('names a product of the catalogue, its lightest format, and photos that exist', () => {
    expect(
      validateRecipes({
        recipes: recipesFr,
        productSlugs: products.map((p) => p.slug),
        assetExists,
      }),
    ).toEqual([]);
    for (const r of recipesFr) expect(families.get(r.product) ?? r.product, r.slug).toBe(r.product);
  });
  it('gives every shown product at least one recipe, any of its formats', () => {
    for (const p of products.filter((x) => !x.hidden))
      expect(
        recipesFor(
          p.slug,
          recipesFr.filter((r) => !r.hidden),
          families,
        ).length,
        p.slug,
      ).toBeGreaterThan(0);
  });
  it('keeps the five label recipes, marked as such', () => {
    for (const slug of LABEL_RECIPES)
      expect(recipesFr.find((r) => r.slug === slug)?.source, slug).toBe('label');
  });
  it('keeps the label steps one to one in English', () => {
    for (const r of recipesEn.filter((x) => x.source === 'label')) {
      const fr = recipesFr.find((f) => f.slug === r.slug)!;
      expect(r.steps.length, r.slug).toBe(fr.steps.length);
      expect(r.ingredients.length, r.slug).toBe(fr.ingredients.length);
    }
  });
});

describe('validateRecipes', () => {
  it('reports an unknown product, a missing photo and a duplicate slug', () => {
    expect(
      validateRecipes({
        recipes: [
          { slug: 'a', product: 'nope' },
          { slug: 'b', product: 'p', image: '/src/assets/recipes/x.webp' },
          { slug: 'b', product: 'p' },
        ],
        productSlugs: ['p'],
        assetExists: () => false,
      }),
    ).toEqual([
      'a: unknown product "nope"',
      'b: missing image /src/assets/recipes/x.webp',
      'duplicate recipe slug',
    ]);
  });
});

describe('mergeRecipe', () => {
  const fr = frFiles.get('smoothie-au-moringa');
  it('takes shared fields from French only and fills empty English fields', () => {
    const merged = mergeRecipe('smoothie-au-moringa', fr, { title: '', summary: null });
    expect(merged.title).toBe((fr as { title: string }).title);
    expect(merged.summary).toBe((fr as { summary: string }).summary);
    const shared = mergeRecipe('smoothie-au-moringa', fr, {
      prepMinutes: 99,
      product: 'x',
      title: 'Moringa smoothie',
    } as unknown);
    expect(shared.prepMinutes).toBe((fr as { prepMinutes: number }).prepMinutes);
    expect(shared.product).toBe('poudre-de-moringa-100g');
    expect(shared.title).toBe('Moringa smoothie');
  });
  it('names the file in a validation error', () => {
    expect(() => mergeRecipe('x', { ...(fr as object), source: 'web' })).toThrow(
      /recipes\/fr\/x\.yml/,
    );
    expect(() => mergeRecipe('x', { ...(fr as object), prepMinutes: 0 })).toThrow(/prepMinutes/);
  });
});

describe('recipe helpers', () => {
  it('compareRecipes: the CMS order first (missing last), then the title', () => {
    const list = [
      recipe('c', { title: 'Cacao' }),
      recipe('b', { title: 'Bissap', order: 2 }),
      recipe('a', { title: 'Avoine' }),
      recipe('d', { title: 'Dattes', order: 1 }),
    ];
    expect(list.sort(compareRecipes('fr')).map((r) => r.slug)).toEqual(['d', 'b', 'a', 'c']);
  });
  it('publishedRecipes drops hidden recipes and those of a product the site does not show', () => {
    const { recipes, dropped } = publishedRecipes(
      [
        recipe('a'),
        recipe('b', { hidden: true }),
        recipe('c', { product: 'gone-100g' }),
        recipe('d', { product: 'poudre-de-baobab-100g' }),
      ],
      new Set(['poudre-de-moringa-100g', 'poudre-de-baobab-100g']),
    );
    expect(recipes.map((r) => r.slug)).toEqual(['a', 'd']);
    expect(dropped).toEqual(['c -> gone-100g']);
  });
  it('recipesFor: any format of the product, label recipes first', () => {
    const list = [
      recipe('house-1', { product: 'poudre-de-baobab-100g' }),
      recipe('other', { product: 'poudre-de-moringa-100g', source: 'label' }),
      recipe('label-1', { product: 'poudre-de-baobab-100g', source: 'label' }),
      recipe('house-2', { product: 'poudre-de-baobab-100g' }),
    ];
    for (const slug of ['poudre-de-baobab-100g', 'poudre-de-baobab-200g'])
      expect(
        recipesFor(slug, list, families).map((r) => r.slug),
        slug,
      ).toEqual(['label-1', 'house-1', 'house-2']);
    expect(recipesFor('grues-de-cacao-100g', list, families)).toEqual([]);
  });
  it('the 200 g baobab shows the recipes of the 100 g', () => {
    const fromFiles = recipesFor('poudre-de-baobab-200g', recipesFr, families).map((r) => r.slug);
    expect(fromFiles[0]).toBe('boisson-fraiche-au-baobab');
  });
  it('otherRecipes: the same product first, then the ones after it, never itself', () => {
    const list = [
      recipe('a', { product: 'p1' }),
      recipe('b', { product: 'p2' }),
      recipe('c', { product: 'p3' }),
      recipe('d', { product: 'p1' }),
      recipe('e', { product: 'p4' }),
    ];
    expect(otherRecipes(list[2]!, list).map((r) => r.slug)).toEqual(['d', 'e', 'a']);
    expect(otherRecipes(list[0]!, list).map((r) => r.slug)).toEqual(['d', 'b', 'c']);
    expect(otherRecipes(list[4]!, list, new Map(), 2).map((r) => r.slug)).toEqual(['a', 'b']);
    expect(otherRecipes(list[0]!, [list[0]!])).toEqual([]);
  });
});
