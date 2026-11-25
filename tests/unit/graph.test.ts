import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mergeProduct, mergeRecipe } from '../../src/content/merge';
import { settingsSchema, type Review } from '../../src/content/schemas';
import {
  MAX_REVIEW_NODES,
  STORE_ID,
  WEBSITE_ID,
  availability,
  buildGraph,
  isoDuration,
  productGraphInput,
  recipeGraphInput,
  robotsContent,
  schemaPrice,
  serializeGraph,
  type GraphInput,
} from '../../src/seo/graph';
import { toCents } from '../../src/i18n/format';
import { CONTENT, readYaml, yamlFolder } from './helpers';

const store: GraphInput['store'] = {
  name: 'Racines en Partage',
  description: 'Poudres et tisanes',
  slogan: 'Deux terres. Un rituel. Un bien-être à partager.',
  email: 'racinesenpartage@gmail.com',
  telephone: '+33775689108',
  address: { region: "Val-d'Oise", country: 'FR' },
  logo: 'https://racinesenpartage.fr/icons/icon-512.png',
};
const home: GraphInput = {
  kind: 'home',
  canonical: 'https://racinesenpartage.fr/',
  locale: 'fr',
  title: 'Racines en Partage',
  description: 'Accueil',
  store,
};
const types = (input: GraphInput) => buildGraph(input)['@graph'].map((n) => n['@type']);
const node = (input: GraphInput, type: string) =>
  buildGraph(input)['@graph'].find((n) => n['@type'] === type) as Record<string, any> | undefined;

const settings = settingsSchema.parse(readYaml(join(CONTENT, 'settings/shop.yml')));
const moringa = mergeProduct(
  'poudre-de-moringa-100g',
  yamlFolder('products', 'fr').get('poudre-de-moringa-100g'),
);

describe('seo graph', () => {
  it('always carries the store, the site and the page', () => {
    expect(types(home)).toEqual(['OnlineStore', 'WebSite', 'WebPage']);
    expect(buildGraph(home)['@context']).toBe('https://schema.org');
  });
  it('describes the store with its region and country (no street), phone and e-mail', () => {
    const org = node(home, 'OnlineStore');
    expect(org?.['@id']).toBe(STORE_ID);
    expect(org?.telephone).toBe('+33775689108');
    expect(org?.address).toEqual({
      '@type': 'PostalAddress',
      addressRegion: "Val-d'Oise",
      addressCountry: 'FR',
    });
    // The registered address is not a place to visit: it never reaches the graph.
    expect(JSON.stringify(buildGraph(home))).not.toMatch(
      /streetAddress|postalCode|addressLocality/,
    );
    expect(org?.sameAs).toBeUndefined();
    expect(
      node({ ...home, store: { ...store, sameAs: ['https://instagram.com/x'] } }, 'OnlineStore')
        ?.sameAs,
    ).toEqual(['https://instagram.com/x']);
  });
  it('ties the page to the site and the store by id', () => {
    const page = node(home, 'WebPage');
    expect(page?.['@id']).toBe('https://racinesenpartage.fr/');
    expect(page?.isPartOf).toEqual({ '@id': WEBSITE_ID });
    expect(page?.about).toEqual({ '@id': STORE_ID });
    expect(page?.inLanguage).toBe('fr');
  });
  it('types shop and category pages as CollectionPage with their item list', () => {
    const shop: GraphInput = {
      ...home,
      kind: 'category',
      canonical: 'https://racinesenpartage.fr/boutique/cacao/',
      breadcrumbs: [
        { name: 'Accueil', url: 'https://racinesenpartage.fr/' },
        { name: 'Boutique', url: 'https://racinesenpartage.fr/boutique/' },
        { name: 'Cacao', url: 'https://racinesenpartage.fr/boutique/cacao/' },
      ],
      items: [{ name: 'Grués', url: 'https://racinesenpartage.fr/produits/grues-de-cacao-100g/' }],
    };
    expect(types(shop)).toEqual(['OnlineStore', 'WebSite', 'CollectionPage', 'BreadcrumbList']);
    const page = node(shop, 'CollectionPage');
    expect(page?.mainEntity.numberOfItems).toBe(1);
    expect(page?.breadcrumb).toEqual({ '@id': `${shop.canonical}#breadcrumbs` });
    expect(node(shop, 'BreadcrumbList')?.itemListElement.map((i: any) => i.position)).toEqual([
      1, 2, 3,
    ]);
  });
  it('adds a Product with an Offer on product pages', () => {
    const input: GraphInput = {
      ...home,
      kind: 'product',
      canonical: 'https://racinesenpartage.fr/produits/poudre-de-moringa-100g/',
      product: productGraphInput(
        moringa,
        settings,
        ['https://racinesenpartage.fr/_astro/m.webp'],
        'Poudres',
      ),
    };
    const product = node(input, 'Product');
    expect(product?.sku).toBe('REP-MOR-100');
    expect(product?.countryOfOrigin).toEqual({ '@type': 'Country', name: 'NE' });
    expect(product?.weight).toEqual({ '@type': 'QuantitativeValue', value: 100, unitCode: 'GRM' });
    expect(product?.offers).toMatchObject({
      '@type': 'Offer',
      price: schemaPrice(toCents(moringa.price)),
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': STORE_ID },
    });
    expect(product?.offers.shippingDetails.shippingRate).toEqual({
      '@type': 'MonetaryAmount',
      value: '4.90',
      currency: 'EUR',
    });
    expect(
      product?.offers.shippingDetails.shippingDestination.map((d: any) => d.addressCountry),
    ).toEqual(['FR', 'BE', 'LU']);
    expect(product?.offers.shippingDetails.deliveryTime.transitTime).toMatchObject({
      minValue: 3,
      maxValue: 5,
    });
    expect(node(input, 'ItemPage')?.mainEntity).toEqual({ '@id': `${input.canonical}#product` });
  });
  it('has no rating without reviews', () => {
    const product = productGraphInput(moringa, settings, []);
    expect(product.rating).toBeUndefined();
    const out = node({ ...home, kind: 'product', product }, 'Product');
    expect(out?.aggregateRating).toBeUndefined();
    expect(out?.review).toBeUndefined();
  });
  it('adds the aggregate rating and the first five reviews', () => {
    const reviews: Review[] = Array.from({ length: 7 }, (_, i) => ({
      id: `r${i}`,
      product: moringa.slug,
      rating: i === 0 ? 4 : 5,
      author: `Client ${i}`,
      locale: i === 1 ? 'en' : 'fr',
      date: `2026-11-0${7 - i}`,
      order: '',
      verified: true,
      published: true,
      title: i === 0 ? 'Très bon' : '',
      text: 'Un vrai goût de feuille, très doux.',
      reply: '',
    }));
    const input: GraphInput = {
      ...home,
      kind: 'product',
      canonical: 'https://racinesenpartage.fr/produits/poudre-de-moringa-100g/',
      product: productGraphInput(moringa, settings, [], 'Poudres', reviews),
    };
    const product = node(input, 'Product');
    expect(product?.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.9,
      reviewCount: 7,
      bestRating: 5,
      worstRating: 1,
    });
    expect(product?.review).toHaveLength(MAX_REVIEW_NODES);
    expect(product?.review[0]).toEqual({
      '@type': 'Review',
      author: { '@type': 'Person', name: 'Client 0' },
      datePublished: '2026-11-07',
      name: 'Très bon',
      reviewBody: 'Un vrai goût de feuille, très doux.',
      inLanguage: 'fr',
      reviewRating: { '@type': 'Rating', ratingValue: 4, bestRating: 5, worstRating: 1 },
    });
    expect(product?.review[1].inLanguage).toBe('en');
    expect(product?.review[1].name).toBeUndefined();
  });
  it('describes a recipe page with one Recipe, the fields Google reads', () => {
    const canonical = 'https://racinesenpartage.fr/recettes/infusion-de-bissap/';
    const input: GraphInput = {
      ...home,
      kind: 'recipe',
      canonical,
      title: 'Infusion de bissap',
      breadcrumbs: [
        { name: 'Accueil', url: 'https://racinesenpartage.fr/' },
        { name: 'Recettes', url: 'https://racinesenpartage.fr/recettes/' },
        { name: 'Infusion de bissap', url: canonical },
      ],
      recipe: {
        name: 'Infusion de bissap',
        description: 'Des fleurs, de l’eau et un quart d’heure.',
        images: ['https://racinesenpartage.fr/_astro/b.webp'],
        ingredients: ['1 litre d’eau', '2 cuillères de fleurs'],
        steps: ['Faire bouillir.', 'Infuser.'],
        prepMinutes: 5,
        restMinutes: 15,
        yield: '1 litre',
        keywords: ['Fleurs d’hibiscus', 'bissap'],
      },
    };
    expect(types(input)).toEqual(['OnlineStore', 'WebSite', 'WebPage', 'BreadcrumbList', 'Recipe']);
    expect(node(input, 'WebPage')?.mainEntity).toEqual({ '@id': `${canonical}#recipe` });
    expect(node(input, 'Recipe')).toEqual({
      '@type': 'Recipe',
      '@id': `${canonical}#recipe`,
      name: 'Infusion de bissap',
      description: 'Des fleurs, de l’eau et un quart d’heure.',
      url: canonical,
      image: ['https://racinesenpartage.fr/_astro/b.webp'],
      author: { '@id': STORE_ID },
      publisher: { '@id': STORE_ID },
      inLanguage: 'fr',
      prepTime: 'PT5M',
      totalTime: 'PT20M',
      recipeYield: '1 litre',
      keywords: 'Fleurs d’hibiscus, bissap',
      recipeIngredient: ['1 litre d’eau', '2 cuillères de fleurs'],
      recipeInstructions: [
        { '@type': 'HowToStep', position: 1, text: 'Faire bouillir.' },
        { '@type': 'HowToStep', position: 2, text: 'Infuser.' },
      ],
      mainEntityOfPage: { '@id': canonical },
    });
    // Cooking time only when the recipe cooks.
    const cooked = node(
      { ...input, recipe: { ...input.recipe!, cookMinutes: 10, restMinutes: undefined } },
      'Recipe',
    );
    expect(cooked?.cookTime).toBe('PT10M');
    expect(cooked?.totalTime).toBe('PT15M');
  });
  it('builds a valid Recipe from every recipe file', () => {
    // Google: name and image required; the rest recommended. schema.org: the
    // properties of Recipe, HowTo and CreativeWork.
    const ALLOWED = new Set([
      '@type',
      '@id',
      'name',
      'description',
      'url',
      'image',
      'author',
      'publisher',
      'inLanguage',
      'prepTime',
      'cookTime',
      'totalTime',
      'recipeYield',
      'keywords',
      'recipeIngredient',
      'recipeInstructions',
      'mainEntityOfPage',
    ]);
    const fr = yamlFolder('recipes', 'fr');
    const en = yamlFolder('recipes', 'en');
    const products = yamlFolder('products', 'fr');
    expect(fr.size).toBeGreaterThanOrEqual(5);
    for (const [slug, raw] of fr) {
      for (const locale of ['fr', 'en'] as const) {
        const r = mergeRecipe(slug, raw, locale === 'fr' ? undefined : (en.get(slug) ?? {}));
        const p = mergeProduct(r.product, products.get(r.product));
        const canonical = `https://racinesenpartage.fr/recettes/${slug}/`;
        const recipe = node(
          {
            ...home,
            locale,
            kind: 'recipe',
            canonical,
            recipe: recipeGraphInput(r, p, ['https://racinesenpartage.fr/_astro/x.webp']),
          },
          'Recipe',
        )!;
        for (const key of Object.keys(recipe))
          expect(ALLOWED.has(key), `${slug} ${key}`).toBe(true);
        expect(recipe.name, slug).toBeTruthy();
        expect(recipe.image, slug).toHaveLength(1);
        expect(recipe.description.length, slug).toBeGreaterThan(20);
        expect(recipe.recipeIngredient.length, slug).toBeGreaterThan(0);
        expect(recipe.recipeInstructions.length, slug).toBe(r.steps.length);
        expect(recipe.prepTime, slug).toMatch(/^PT(\d+H)?(\d+M)?$/);
        expect(recipe.totalTime, slug).toMatch(/^PT(\d+H)?(\d+M)?$/);
        expect(recipe.keywords, slug).toContain(p.name);
        expect(recipe.inLanguage).toBe(locale);
      }
    }
  });
  it('writes minutes as ISO 8601 durations', () => {
    expect(isoDuration(5)).toBe('PT5M');
    expect(isoDuration(60)).toBe('PT1H');
    expect(isoDuration(90)).toBe('PT1H30M');
    expect(isoDuration(720)).toBe('PT12H');
    expect(() => isoDuration(1.5)).toThrow();
  });
  it('takes the SEO description when set and each keyword once', () => {
    const r = mergeRecipe('x', {
      product: 'poudre-de-moringa-100g',
      source: 'house',
      prepMinutes: 5,
      title: 'T',
      summary: 'Résumé.',
      seoDescription: 'Pour Google.',
      yield: '2 verres',
      ingredients: ['a'],
      steps: ['b'],
    });
    const g = recipeGraphInput(r, { name: 'Moringa', keywords: ['Moringa', 'foléré'] }, ['u']);
    expect(g.description).toBe('Pour Google.');
    expect(g.keywords).toEqual(['Moringa', 'foléré']);
    expect(g.cookMinutes).toBeUndefined();
  });
  it('lists the recipes of the recipes page as an ItemList of links', () => {
    const canonical = 'https://racinesenpartage.fr/recettes/';
    const page = node(
      {
        ...home,
        kind: 'recipes',
        canonical,
        items: [
          { name: 'Infusion de bissap', url: `${canonical}infusion-de-bissap/` },
          { name: 'Jus de bouye', url: `${canonical}jus-de-bouye/` },
        ],
      },
      'CollectionPage',
    );
    expect(page?.mainEntity).toEqual({
      '@type': 'ItemList',
      numberOfItems: 2,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Infusion de bissap',
          url: `${canonical}infusion-de-bissap/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Jus de bouye',
          url: `${canonical}jus-de-bouye/`,
        },
      ],
    });
  });
  it('turns the FAQ into questions', () => {
    const faq = node({ ...home, kind: 'faq', faq: [{ question: 'Q ?', answer: 'R.' }] }, 'FAQPage');
    expect(faq?.mainEntity).toEqual([
      { '@type': 'Question', name: 'Q ?', acceptedAnswer: { '@type': 'Answer', text: 'R.' } },
    ]);
  });
  it('maps stock to availability and cents to price strings', () => {
    expect(availability('low')).toBe('https://schema.org/LimitedAvailability');
    expect(availability('out')).toBe('https://schema.org/OutOfStock');
    expect(schemaPrice(1590)).toBe('15.90');
  });
  it('escapes < so the script can never be closed', () => {
    const out = serializeGraph(buildGraph({ ...home, title: '</script><b>' }));
    expect(out).not.toContain('<');
    expect(JSON.parse(out)['@graph'][2].name).toBe('</script><b>');
  });
  it('says index or noindex, never both', () => {
    expect(robotsContent(false)).toBe('index, follow, max-image-preview:large');
    expect(robotsContent(true)).toBe('noindex, nofollow');
  });
});
