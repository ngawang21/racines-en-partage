import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { localeSchema } from '../../src/content/locale-schema';
import {
  compareProducts,
  dropDanglingRelated,
  mergeCategory,
  mergePage,
  mergeProduct,
  publishedProducts,
} from '../../src/content/merge';
import {
  LEGAL_KEYS,
  PAGE_SCHEMAS,
  categorySchema,
  legalFrontmatterSchema,
  productSchema,
  productTranslationSchema,
  reviewSchema,
  settingsSchema,
  validateCatalog,
  type PageKey,
  type Product,
} from '../../src/content/schemas';
import { CONTENT, ROOT, assetExists, readJson, readYaml, strings, yamlFolder } from './helpers';

const frProducts = yamlFolder('products', 'fr');
const enProducts = yamlFolder('products', 'en');
const frCategories = yamlFolder('categories', 'fr');
const enCategories = yamlFolder('categories', 'en');
const productsFr: Product[] = [...frProducts].map(([slug, raw]) => mergeProduct(slug, raw));
const productsEn: Product[] = [...frProducts].map(([slug, raw]) =>
  mergeProduct(slug, raw, enProducts.get(slug) ?? {}),
);
const bySlug = new Map(productsFr.map((p) => [p.slug, p]));

const validProduct = () => structuredClone(frProducts.get('poudre-de-moringa-100g')) as any;

describe('settings', () => {
  const settings = settingsSchema.parse(readYaml(join(CONTENT, 'settings/shop.yml')));
  it('match spec 4.4', () => {
    expect(settings.brand.email).toBe('racinesenpartage@gmail.com');
    expect(settings.brand.phone).toBe('0775689108');
    expect(settings.brand.address).toEqual({
      street: '9 Rue du Marché',
      postcode: '95400',
      city: 'Arnouville',
      country: 'FR',
    });
    expect(settings.shop).toMatchObject({
      open: true,
      currency: 'eur',
      vat: { mode: 'franchise', rate: 5.5 },
      freeShippingFrom: 49,
      maxQuantityPerLine: 10,
    });
    expect(settings.shipping.map((s) => [s.id, s.price, s.countries])).toEqual([
      ['relay', 4.9, ['FR', 'BE', 'LU']],
      ['home', 6.9, ['FR']],
      ['pickup', 0, ['FR']],
    ]);
    expect(settings.launch.pricesConfirmed).toBe(false);
    expect(settings.brand.siret).toBe('911 858 843 00020');
  });
  it('carries a SIRET with a valid Luhn checksum (the launch check runs the same test)', () => {
    const luhn = (digits: string) =>
      [...digits].reverse().reduce((sum, c, i) => {
        const d = Number(c) * (i % 2 === 1 ? 2 : 1);
        return sum + (d > 9 ? d - 9 : d);
      }, 0) %
        10 ===
      0;
    const siret = settings.brand.siret.replace(/\s/g, '');
    expect(siret).toMatch(/^\d{14}$/);
    expect(luhn(siret)).toBe(true);
    expect(luhn('91185884300021')).toBe(false);
  });
  it('rejects a malformed SIREN, phone or duplicate method', () => {
    const raw = readYaml(join(CONTENT, 'settings/shop.yml')) as any;
    expect(() =>
      settingsSchema.parse({ ...raw, brand: { ...raw.brand, siret: '12345' } }),
    ).toThrow();
    expect(() =>
      settingsSchema.parse({ ...raw, brand: { ...raw.brand, phone: '+33775689108' } }),
    ).toThrow();
    expect(() =>
      settingsSchema.parse({ ...raw, shipping: [raw.shipping[0], raw.shipping[0]] }),
    ).toThrow();
    expect(
      settingsSchema.parse({ ...raw, brand: { ...raw.brand, siret: '123 456 789 00012' } }).brand
        .siret,
    ).toBe('123 456 789 00012');
  });
});

describe('product schema', () => {
  it('every French file is valid and has an English twin', () => {
    expect(frProducts.size).toBe(11);
    for (const [slug, raw] of frProducts)
      expect(() => productSchema.parse(raw), slug).not.toThrow();
    expect([...enProducts.keys()]).toEqual([...frProducts.keys()]);
    for (const [slug, raw] of enProducts)
      expect(() => productTranslationSchema.parse(raw), slug).not.toThrow();
  });
  it('rejects a zero price, three decimals, an empty or foreign image list', () => {
    expect(() => productSchema.parse({ ...validProduct(), price: 0 })).toThrow();
    expect(() => productSchema.parse({ ...validProduct(), price: 8.999 })).toThrow();
    expect(() => productSchema.parse({ ...validProduct(), weightGrams: 0 })).toThrow();
    expect(() => productSchema.parse({ ...validProduct(), images: [] })).toThrow();
    expect(() =>
      productSchema.parse({ ...validProduct(), images: ['/src/assets/brand/hero-trio.webp'] }),
    ).toThrow();
    expect(() => productSchema.parse({ ...validProduct(), stock: 'soon' })).toThrow();
  });
  it('refuses a verified nutrition flag without a table', () => {
    const { nutrition: _n, ...rest } = validProduct();
    expect(() => productSchema.parse({ ...rest, nutritionVerified: true })).toThrow(/nutrition/);
    expect(() => productSchema.parse({ ...rest, nutritionVerified: false })).not.toThrow();
  });
});

describe('catalogue cross checks', () => {
  const categorySlugs = [...frCategories.keys()];
  it('the seed catalogue passes: unique sku, known category, related and images', () => {
    expect(validateCatalog({ products: productsFr, categorySlugs, assetExists })).toEqual([]);
  });
  it('every product image exists under src/assets/products', () => {
    for (const p of productsFr) {
      for (const img of p.images) {
        expect(img.startsWith('/src/assets/products/'), p.slug).toBe(true);
        expect(assetExists(img), img).toBe(true);
      }
    }
  });
  it('reports a duplicate sku, unknown category, unknown related and a missing image', () => {
    const [a, b] = productsFr as [Product, Product];
    const problems = validateCatalog({
      products: [
        { ...a, related: ['nope', a.slug] },
        { ...b, sku: a.sku, category: 'thé', images: ['/src/assets/products/missing.webp'] },
      ],
      categorySlugs,
      assetExists,
    });
    expect(problems.join('\n')).toMatch(/already used/);
    expect(problems.join('\n')).toMatch(/unknown category "thé"/);
    expect(problems.join('\n')).toMatch(/unknown related product "nope"/);
    expect(problems.join('\n')).toMatch(/related to itself/);
    expect(problems.join('\n')).toMatch(/missing image/);
  });
});

describe('seed catalogue (spec appendix A, owner sheet of 2026-11-08)', () => {
  it('carries the eleven SKUs, the owner prices and the weights', () => {
    const rows = Object.fromEntries(productsFr.map((p) => [p.sku, [p.price, p.weightGrams]]));
    expect(rows).toEqual({
      'REP-MOR-100': [6, 100],
      'REP-MOR-200': [11, 200],
      'REP-BAO-100': [6, 100],
      'REP-BAO-200': [12, 200],
      'REP-SOU-P100': [5, 100],
      'REP-SOU-T200': [7, 200],
      'REP-ORG-100': [5, 100],
      'REP-HIB-100': [4, 100],
      'REP-PSY-200': [7, 200],
      // Placeholders: the owner's sheet has no cacao prices yet.
      'REP-CAC-P100': [6.9, 100],
      'REP-CAC-G100': [7.9, 100],
    });
  });
  it('keeps the placeholder comment on the two cacao prices only', () => {
    const placeholder = /^price: .*# placeholder/m;
    for (const slug of frProducts.keys()) {
      const src = readFileSync(join(CONTENT, 'products/fr', `${slug}.yml`), 'utf8');
      expect(placeholder.test(src), slug).toBe(slug.includes('cacao'));
      expect(src, slug).not.toMatch(/owner to confirm/);
    }
  });
  it('carries the owner origins', () => {
    expect(bySlug.get('fleurs-d-hibiscus-bissap-100g')).toMatchObject({
      origin: 'Cameroun',
      originCountryCode: 'CM',
    });
    expect(bySlug.get('tubercules-de-souchet-200g')).toMatchObject({
      origin: 'Niger',
      originCountryCode: 'NE',
    });
  });
  it('adds the baobab 200 g format next to the 100 g one', () => {
    const b100 = bySlug.get('poudre-de-baobab-100g')!;
    const b200 = bySlug.get('poudre-de-baobab-200g')!;
    expect(b200).toMatchObject({
      sku: 'REP-BAO-200',
      price: 12,
      weightGrams: 200,
      category: b100.category,
      name: b100.name,
      featured: false,
      images: ['/src/assets/products/baobab-200.webp'],
    });
    expect(b200.order).toBe(b100.order! + 1);
    expect(b200.related).toEqual(['poudre-de-baobab-100g', 'poudre-de-moringa-200g']);
    expect(enProducts.has('poudre-de-baobab-200g')).toBe(true);
  });
  it('gives every product search keywords in both languages', () => {
    for (const locale of [productsFr, productsEn]) {
      for (const p of locale) {
        expect(p.keywords.length, p.slug).toBeGreaterThan(0);
        expect(
          p.keywords.every((k) => k.trim() !== ''),
          p.slug,
        ).toBe(true);
      }
    }
    for (const [slug, raw] of enProducts)
      expect((raw as { keywords?: string[] }).keywords?.length, slug).toBeGreaterThan(0);
    const kw = (slug: string) => bySlug.get(slug)!.keywords;
    expect(kw('fleurs-d-hibiscus-bissap-100g')).toEqual(
      expect.arrayContaining(['bissap', 'foléré', 'dah', 'wonjo', 'zobo', 'karkadé']),
    );
    expect(kw('tubercules-de-souchet-200g')).toEqual(
      expect.arrayContaining(['tchongon', 'chufa', 'amande de terre', 'noix tigrée', 'horchata']),
    );
    expect(kw('poudre-d-orge-grillee-100g')).toContain('tsampa');
    expect(kw('teguments-de-psyllium-200g')).toContain('ispaghul');
    expect(kw('poudre-de-baobab-100g')).toContain('pain de singe');
    expect(kw('grues-de-cacao-100g')).toContain('nibs');
  });
  it('prints no health or nutrition claim the displayed tables do not support', () => {
    const forbidden = [
      /transit/i,
      /vitamine/i,
      /vitamin/i,
      /antioxyd/i,
      /antioxid/i,
      /polyph[ée]nol/i,
      /microbiot/i,
      /pr[ée]biotique/i,
      /prebiotic/i,
      /assimilation/i,
      /b[ée]n[ée]fique/i,
      /d[ée]salt[ée]rant/i,
      /min[ée]ra(l|ux)/i,
      /sans sucre ajout/i,
      /no added sugar/i,
    ];
    const rich = /riche en fibres|rich in fibre|source de protéines|source of plant protein/i;
    for (const p of [...productsFr, ...productsEn]) {
      const { nutrition: _n, ...rest } = p;
      const printed = JSON.stringify(rest);
      for (const re of forbidden) expect(printed, `${p.slug}: ${re}`).not.toMatch(re);
      if (rich.test(printed)) {
        expect(p.nutritionVerified, p.slug).toBe(true);
        expect(
          Number.parseFloat(p.nutrition!.fibre.replace(',', '.')),
          p.slug,
        ).toBeGreaterThanOrEqual(6);
      }
    }
  });
  it('features moringa 100 g, baobab, souchet tubercules and hibiscus', () => {
    expect(
      productsFr
        .filter((p) => p.featured)
        .map((p) => p.slug)
        .sort(),
    ).toEqual([
      'fleurs-d-hibiscus-bissap-100g',
      'poudre-de-baobab-100g',
      'poudre-de-moringa-100g',
      'tubercules-de-souchet-200g',
    ]);
  });
  it('hides the unverified nutrition tables', () => {
    const unverified = productsFr.filter((p) => !p.nutritionVerified).map((p) => p.slug);
    expect(unverified.sort()).toEqual([
      'grues-de-cacao-100g',
      'poudre-de-baobab-100g',
      'poudre-de-baobab-200g',
      'poudre-de-souchet-100g',
      'teguments-de-psyllium-200g',
      'tubercules-de-souchet-200g',
    ]);
  });
  it('pairs the related products both ways', () => {
    const pairs = [
      ['poudre-de-moringa-100g', 'poudre-de-moringa-200g'],
      ['poudre-de-baobab-100g', 'poudre-de-baobab-200g'],
      ['poudre-de-cacao-100g', 'grues-de-cacao-100g'],
      ['poudre-de-souchet-100g', 'tubercules-de-souchet-200g'],
      ['fleurs-d-hibiscus-bissap-100g', 'poudre-de-baobab-100g'],
      ['poudre-d-orge-grillee-100g', 'teguments-de-psyllium-200g'],
    ];
    for (const [a, b] of pairs) {
      expect(bySlug.get(a!)?.related, a).toContain(b);
      expect(bySlug.get(b!)?.related, b).toContain(a);
    }
  });
  it('never lists gluten as absent from barley', () => {
    const orge = bySlug.get('poudre-d-orge-grillee-100g');
    expect(orge?.free_from).not.toContain('gluten');
    expect(orge?.ingredients.toLowerCase()).not.toContain('sans gluten');
  });
  it('is translated: every English name differs, shared fields come from French', () => {
    for (const p of productsEn) {
      const fr = bySlug.get(p.slug)!;
      expect(p.name, p.slug).not.toBe(fr.name);
      expect(p.description, p.slug).not.toBe(fr.description);
      expect(p.price).toBe(fr.price);
      expect(p.images).toEqual(fr.images);
      expect(p.benefits.length, p.slug).toBe(fr.benefits.length);
    }
  });
  it('keeps the label bullets one to one in English', () => {
    for (const p of productsEn) {
      const fr = bySlug.get(p.slug)!;
      expect(p.usage.length, p.slug).toBe(fr.usage.length);
      expect(p.recipe?.steps.length, p.slug).toBe(fr.recipe?.steps.length);
    }
  });
});

describe('merge', () => {
  it('ignores shared fields written in the English file', () => {
    const fr = frProducts.get('poudre-de-baobab-100g');
    const merged = mergeProduct('poudre-de-baobab-100g', fr, { price: 1, name: 'Baobab' });
    expect(merged.price).toBe(6);
    expect(merged.name).toBe('Baobab');
  });
  it('fills empty or missing English fields from French', () => {
    const fr = frProducts.get('poudre-de-moringa-100g');
    const merged = mergeProduct('poudre-de-moringa-100g', fr, { name: '', tagline: null });
    expect(merged.name).toBe('Poudre de moringa');
    expect(merged.tagline).toBe((fr as any).tagline);
    expect(merged.recipe?.title).toBe('Smoothie au moringa');
  });
  it('ignores the order key the CMS writes into the English file', () => {
    const fr = frProducts.get('poudre-de-baobab-100g');
    const merged = mergeProduct('poudre-de-baobab-100g', fr, { order: 99, name: 'Baobab' });
    expect(merged.order).toBe((fr as { order: number }).order);
  });
  it('names the file in a validation error', () => {
    expect(() => mergeProduct('x', { ...validProduct(), price: -1 })).toThrow(
      /products\/fr\/x\.yml/,
    );
  });
});

describe('hidden, deleted and reordered products', () => {
  const withSlug = (slug: string, patch: Partial<Product> = {}): Product => ({
    ...mergeProduct(slug, frProducts.get(slug)),
    ...patch,
  });

  it('seeds no hidden product and a distinct position for each product', () => {
    expect(productsFr.filter((p) => p.hidden)).toEqual([]);
    const orders = productsFr.map((p) => p.order);
    expect(orders.every((o) => Number.isInteger(o))).toBe(true);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('defaults hidden to false and accepts a file without order', () => {
    const raw = validProduct();
    delete raw.order;
    delete raw.hidden;
    const p = productSchema.parse(raw);
    expect(p.hidden).toBe(false);
    expect(p.order).toBeUndefined();
    expect(productSchema.safeParse({ ...raw, hidden: 'yes' }).success).toBe(false);
    expect(productSchema.safeParse({ ...raw, order: 1.5 }).success).toBe(false);
  });

  it('leaves hidden products out, with the related links that point to them', () => {
    const list = [
      withSlug('poudre-de-moringa-100g', {
        related: ['poudre-de-baobab-100g', 'poudre-de-moringa-200g'],
      }),
      withSlug('poudre-de-baobab-100g', { hidden: true }),
      withSlug('poudre-de-moringa-200g'),
    ];
    const shown = publishedProducts(list);
    expect(shown.map((p) => p.slug)).toEqual(['poudre-de-moringa-100g', 'poudre-de-moringa-200g']);
    expect(shown[0]!.related).toEqual(['poudre-de-moringa-200g']);
    expect(list[0]!.related).toHaveLength(2);
    // Nothing hidden: the same list comes back.
    expect(publishedProducts(productsFr)).toBe(productsFr);
  });

  it('drops related links to a deleted product instead of failing the build', () => {
    const list = [
      withSlug('poudre-de-moringa-100g', { related: ['gone-100g', 'poudre-de-moringa-200g'] }),
      withSlug('poudre-de-moringa-200g', { related: ['poudre-de-moringa-100g'] }),
    ];
    const { products, dropped } = dropDanglingRelated(list);
    expect(dropped).toEqual(['poudre-de-moringa-100g -> gone-100g']);
    expect(products[0]!.related).toEqual(['poudre-de-moringa-200g']);
    expect(products[1]).toBe(list[1]);
    expect(
      validateCatalog({ products, categorySlugs: ['poudres'], assetExists: () => true }),
    ).toEqual([]);
  });

  it('sorts by category, then position, then name; a product without position comes last', () => {
    const order = new Map([
      ['poudres', 1],
      ['infusions', 2],
    ]);
    const list = [
      withSlug('fleurs-d-hibiscus-bissap-100g', { order: 1 }),
      withSlug('poudre-de-souchet-100g', { order: undefined }),
      withSlug('poudre-de-moringa-200g', { order: 2 }),
      withSlug('poudre-de-baobab-100g', { order: 7 }),
      withSlug('poudre-d-orge-grillee-100g', { order: undefined }),
    ];
    expect(list.sort(compareProducts(order, 'fr')).map((p) => p.slug)).toEqual([
      'poudre-de-moringa-200g',
      'poudre-de-baobab-100g',
      'poudre-d-orge-grillee-100g',
      'poudre-de-souchet-100g',
      'fleurs-d-hibiscus-bissap-100g',
    ]);
  });

  it('keeps the seeded positions in the order the shop showed before', () => {
    const order = new Map([...frCategories].map(([slug, raw]) => [slug, (raw as any).order]));
    const byPosition = [...productsFr].sort(compareProducts(order, 'fr')).map((p) => p.slug);
    const byName = [...productsFr]
      .sort(
        (a, b) =>
          order.get(a.category) - order.get(b.category) ||
          a.name.localeCompare(b.name, 'fr') ||
          a.weightGrams - b.weightGrams,
      )
      .map((p) => p.slug);
    expect(byPosition).toEqual(byName);
  });
});

describe('reviews folder', () => {
  const dir = join(CONTENT, 'reviews');
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
  it('is never empty (Astro warns on every page of an empty glob collection)', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it('every file matches the review schema', () => {
    for (const f of files) {
      expect(
        () => reviewSchema.parse(parseYaml(readFileSync(join(dir, f), 'utf8'))),
        f,
      ).not.toThrow();
    }
  });
  it('the model review can never be shown: its product is not in the catalogue', () => {
    const model = reviewSchema.parse(
      parseYaml(readFileSync(join(dir, 'exemple--modele.yml'), 'utf8')),
    );
    expect(model.published).toBe(false);
    expect([...frProducts.keys()]).not.toContain(model.product);
  });
});

describe('categories', () => {
  it('four categories with existing images, translated', () => {
    expect([...frCategories.keys()].sort()).toEqual(['cacao', 'graines', 'infusions', 'poudres']);
    for (const [slug, raw] of frCategories) {
      const c = categorySchema.parse(raw);
      expect(assetExists(c.image), slug).toBe(true);
      const en = mergeCategory(slug, raw, enCategories.get(slug));
      expect(en.order).toBe(c.order);
    }
    expect(
      mergeCategory('poudres', frCategories.get('poudres'), enCategories.get('poudres')).name,
    ).toBe('Plant powders');
  });
  it('every category holds at least one product', () => {
    for (const slug of frCategories.keys()) {
      expect(
        productsFr.some((p) => p.category === slug),
        slug,
      ).toBe(true);
    }
  });
});

describe('pages', () => {
  const keys = Object.keys(PAGE_SCHEMAS) as PageKey[];
  const pages = (locale: string) => yamlFolder('pages', locale);
  it('home, about, faq and contact are valid in both locales', () => {
    expect([...pages('fr').keys()].sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(() => mergePage(key, pages('fr').get(key)), key).not.toThrow();
      expect(() => mergePage(key, pages('fr').get(key), pages('en').get(key)), key).not.toThrow();
    }
  });
  it('the English pages are translated', () => {
    const fr = mergePage('home', pages('fr').get('home'));
    const en = mergePage('home', pages('fr').get('home'), pages('en').get('home'));
    expect(en.hero.title).not.toBe(fr.hero.title);
    expect(en.storyBody).not.toBe(fr.storyBody);
  });
  it('the home story lands list every product origin country, in both locales', () => {
    // The country is the part of `origin` before any comma ("Allemagne, Sonam’Tsampa").
    const country = (p: Product) => p.origin.split(',')[0]!.trim();
    const home = (locale: string) =>
      mergePage(
        'home',
        pages('fr').get('home'),
        locale === 'fr' ? undefined : pages(locale).get('home'),
      );
    for (const [locale, products] of [
      ['fr', productsFr],
      ['en', productsEn],
    ] as const) {
      const { storyLands, storyBody } = home(locale);
      const from = storyLands.from;
      for (const p of products) expect(from, `${locale} ${p.slug}`).toContain(country(p));
      expect(new Set(from).size, locale).toBe(from.length);
      // The lands show as chips under the story: the paragraph does not list
      // them a second time (review 13, each fact once on the home page).
      for (const land of from) expect(storyBody, `${locale} ${land}`).not.toContain(land);
    }
  });
  it('the home page names the ESAT once outside the trust strip, in the commitments', () => {
    for (const locale of ['fr', 'en'] as const) {
      const home = mergePage(
        'home',
        pages('fr').get('home'),
        locale === 'fr' ? undefined : pages('en').get('home'),
      );
      expect(home.commitmentBody, locale).toContain('ESAT Les Oliviers');
      const elsewhere = [home.hero.title, home.hero.lead, home.storyBody, home.ritualTitle]
        .concat(home.ritual.map((m) => m.text))
        .join(' ');
      expect(elsewhere, locale).not.toContain('ESAT');
    }
  });
  it('the home hero keeps its last words together', () => {
    const title = (locale: 'fr' | 'en') =>
      mergePage(
        'home',
        pages('fr').get('home'),
        locale === 'fr' ? undefined : pages('en').get('home'),
      ).hero.title;
    expect(title('fr')).toContain('de\u00a0l’Ouest');
    expect(title('en')).toContain('West\u00a0African');
  });
  it('the home ritual points at three different products that carry a recipe', () => {
    for (const locale of ['fr', 'en'] as const) {
      const home = mergePage(
        'home',
        pages('fr').get('home'),
        locale === 'fr' ? undefined : pages('en').get('home'),
      );
      const slugs = home.ritual.map((m) => m.product);
      expect(new Set(slugs).size, locale).toBe(3);
      for (const slug of slugs) expect(bySlug.get(slug)?.recipe, `${locale} ${slug}`).toBeDefined();
    }
  });
  it('the home reassurance strip carries the owner promise, in order', () => {
    const items = (locale: string) =>
      mergePage(
        'home',
        pages('fr').get('home'),
        locale === 'fr' ? undefined : pages(locale).get('home'),
      ).reassurance;
    expect(items('fr')).toEqual([
      { icon: 'leaf', text: '100 % végétal, sans additif ni conservateur' },
      { icon: 'pin', text: 'Conditionné en France par l’ESAT Les Oliviers' },
      { icon: 'truck', text: 'Livraison en Point Relais, offerte dès 49 €' },
      { icon: 'lock', text: 'Paiement sécurisé' },
    ]);
    expect(items('en').map((i) => i.icon)).toEqual(['leaf', 'pin', 'truck', 'lock']);
    expect(items('en')[0]!.text).toMatch(/100% plant-based/);
  });
  it('the about page states the promise and the FAQ the new services', () => {
    const about = mergePage('about', pages('fr').get('about'));
    expect(about.sections.map((s) => s.body).join(' ')).toContain(
      'Tous nos produits sont 100 % végétaux, sans additif ni conservateur.',
    );
    const faq = (locale: string) =>
      mergePage(
        'faq',
        pages('fr').get('faq'),
        locale === 'fr' ? undefined : pages(locale).get('faq'),
      );
    const questions = faq('fr').items.map((i) => i.question);
    for (const q of [
      'Comment retrouver ma commande ?',
      'Puis-je donner mon avis sur un produit ?',
      'Puis-je recevoir vos nouveautés ?',
    ])
      expect(questions).toContain(q);
    expect(JSON.stringify(faq('fr'))).toContain('/ma-commande/');
    expect(JSON.stringify(faq('en'))).toContain('/en/my-order/');
    expect(faq('en').items).toHaveLength(faq('fr').items.length);
  });
  it('the about images exist', () => {
    for (const s of mergePage('about', pages('fr').get('about')).sections) {
      if (s.image) expect(assetExists(s.image), s.image).toBe(true);
    }
  });
});

describe('legal texts', () => {
  const TOKENS = new Set(['company', 'siren', 'siret', 'address', 'email', 'phone', 'host', 'vat']);
  const read = (locale: string, key: string) =>
    readFileSync(join(CONTENT, 'legal', locale, `${key}.md`), 'utf8');
  const frontmatter = (src: string) => readYamlFrontmatter(src);
  it('legal, terms and privacy exist in both locales with a valid frontmatter', () => {
    for (const locale of ['fr', 'en']) {
      for (const key of LEGAL_KEYS) {
        expect(
          () => legalFrontmatterSchema.parse(frontmatter(read(locale, key))),
          key,
        ).not.toThrow();
      }
    }
  });
  it('use only the known placeholders', () => {
    for (const locale of ['fr', 'en']) {
      for (const key of LEGAL_KEYS) {
        for (const [, name] of read(locale, key).matchAll(/\{([a-zA-Z]+)\}/g)) {
          expect(TOKENS.has(name!), `${locale}/${key}: {${name}}`).toBe(true);
        }
      }
    }
    for (const locale of ['fr', 'en']) {
      expect(read(locale, 'legal')).toContain('SIREN {siren}, SIRET {siret}');
      expect(read(locale, 'legal')).toContain('{host}');
      for (const key of ['terms', 'privacy']) {
        expect(read(locale, key), key).toContain('SIREN {siren}');
        expect(read(locale, key), key).not.toContain('{siret}');
      }
    }
  });
  it('the CGV flag the missing mediator', () => {
    expect(read('fr', 'terms')).toContain('TODO médiateur');
  });
  it('the privacy policy lists the processors and the local cart', () => {
    for (const locale of ['fr', 'en']) {
      const text = read(locale, 'privacy');
      for (const name of [
        'Stripe',
        'Cloudflare',
        'Resend',
        'Mondial Relay',
        'GitHub',
        'localStorage',
      ])
        expect(text, `${locale}: ${name}`).toContain(name);
    }
  });
});

function readYamlFrontmatter(src: string): unknown {
  const match = src.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('no frontmatter');
  return parseYaml(match[1]!);
}

describe('ui strings', () => {
  const fr = readJson(join(CONTENT, 'locales/fr.json'));
  const en = readJson(join(CONTENT, 'locales/en.json'));
  const NAMESPACES = [
    'nav',
    'footer',
    'shop',
    'product',
    'cart',
    'checkout',
    'thanks',
    'errors',
    'legal',
    'reviews',
    'recipes',
    'search',
    'forms',
    'lookup',
    'account',
    'card',
    'a11y',
  ];
  it('both files match the schema and carry exactly the namespaces of the contract', () => {
    expect(Object.keys(localeSchema.parse(fr)).sort()).toEqual([...NAMESPACES].sort());
    expect(() => localeSchema.parse(en)).not.toThrow();
    expect(Object.keys(fr as object).sort()).toEqual([...NAMESPACES].sort());
  });
  it('french is complete (it is the fallback) and english is complete too', () => {
    expect(strings(localeSchema.parse(fr)).filter(([, v]) => v.trim() === '')).toEqual([]);
    expect(strings(localeSchema.parse(en)).filter(([, v]) => v.trim() === '')).toEqual([]);
  });
  it('the two files have the same keys', () => {
    const keys = (v: unknown) =>
      strings(v)
        .map(([k]) => k)
        .sort();
    expect(keys(en)).toEqual(keys(fr));
  });
  it('english is translated', () => {
    expect((en as any).nav.shop).not.toBe((fr as any).nav.shop);
    expect((en as any).product.disclaimer).not.toBe((fr as any).product.disclaimer);
  });
});

describe('writing rules', () => {
  const files = (dir: string, ext: RegExp): string[] =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((d) => d.isFile() && ext.test(d.name))
      .map((d) => join(d.parentPath, d.name));
  it('no em dash in content or Markdown', () => {
    const targets = [
      ...files(CONTENT, /\.(yml|md|json)$/),
      ...['README.md', 'CLAUDE.md', 'docs/content.md', 'docs/guide-proprietaire.md'].map((f) =>
        join(ROOT, f),
      ),
    ];
    const emDash = String.fromCharCode(0x2014);
    for (const f of targets) expect(readFileSync(f, 'utf8'), f).not.toContain(emDash);
  });
  it('the old Outlook address is gone from the content and the owner documents', () => {
    const targets = [
      ...files(CONTENT, /\.(yml|md|json)$/),
      ...[
        'README.md',
        'docs/client/presentation.md',
        'docs/legal-notes.md',
        'docs/handover.md',
      ].map((f) => join(ROOT, f)),
    ];
    for (const f of targets) expect(readFileSync(f, 'utf8'), f).not.toContain('@outlook.com');
  });
});
