import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  buildClientCatalog,
  productLabel,
  serializeForScript,
} from '../../src/catalog/build';
import { mergeProduct } from '../../src/content/merge';
import { settingsSchema, type Product, type Settings } from '../../src/content/schemas';
import { toCents } from '../../src/i18n/format';
import { CONTENT, readYaml, yamlFolder } from './helpers';

const settings = settingsSchema.parse(readYaml(join(CONTENT, 'settings/shop.yml')));
const fr = yamlFolder('products', 'fr');
const en = yamlFolder('products', 'en');
const products = {
  fr: [...fr].map(([slug, raw]) => mergeProduct(slug, raw)),
  en: [...fr].map(([slug, raw]) => mergeProduct(slug, raw, en.get(slug))),
};
const images = Object.fromEntries(
  products.fr.map((p) => [p.sku, `https://racinesenpartage.fr/_astro/${p.slug}.webp`]),
);
const now = new Date('2026-11-01T18:00:00Z');

describe('buildCatalog (dist/catalog.json)', () => {
  const catalog = buildCatalog(products, settings, images, now);
  it('carries the shop settings in cents', () => {
    expect(catalog).toMatchObject({
      generatedAt: '2026-11-01T18:00:00.000Z',
      currency: 'eur',
      vatMode: 'franchise',
      shopOpen: true,
      maxQuantityPerLine: 10,
      freeShippingFrom: 4900,
    });
  });
  it('lists the shipping methods with integer amounts and both labels', () => {
    expect(catalog.shipping[0]).toEqual({
      id: 'relay',
      enabled: true,
      amount: 490,
      countries: ['FR', 'BE', 'LU'],
      label: { fr: 'Point Relais Mondial Relay', en: 'Mondial Relay pickup point' },
      estimate: { fr: '3 à 5 jours ouvrés', en: '3 to 5 working days' },
    });
    expect(catalog.shipping.map((s) => s.amount)).toEqual([490, 690, 0]);
  });
  it('lists every product with its amount, stock, names and image', () => {
    // Prices and the product list belong to the owner: read them from the content.
    expect(catalog.products).toHaveLength(fr.size);
    const moringa = catalog.products.find((p) => p.sku === 'REP-MOR-100');
    const source = products.fr.find((p) => p.sku === 'REP-MOR-100')!;
    expect(moringa).toEqual({
      sku: 'REP-MOR-100',
      slug: 'poudre-de-moringa-100g',
      unitAmount: toCents(source.price),
      weightGrams: 100,
      stock: 'in_stock',
      name: { fr: 'Poudre de moringa 100 g', en: 'Moringa powder 100 g' },
      image: 'https://racinesenpartage.fr/_astro/poudre-de-moringa-100g.webp',
    });
    for (const p of catalog.products) expect(Number.isInteger(p.unitAmount)).toBe(true);
  });
  it('disables free shipping with null and falls back to French names', () => {
    const off: Settings = { ...settings, shop: { ...settings.shop, freeShippingFrom: null } };
    const noEn = buildCatalog({ fr: products.fr, en: [] }, off, images, now);
    expect(noEn.freeShippingFrom).toBeNull();
    expect(noEn.products[0]?.name.en).toBe(noEn.products[0]?.name.fr);
  });
  it('fails loudly on a missing image URL', () => {
    expect(() => buildCatalog(products, settings, {}, now)).toThrow(/no image URL/);
  });
  it('carries the owner switches for the Worker (newsletter, reviews, welcome code)', () => {
    expect(catalog.features).toEqual({
      newsletter: settings.newsletter.enabled,
      reviews: settings.reviews.enabled,
      newsletterWelcomeCode: settings.newsletter.welcomeCode.trim(),
    });
    const off: Settings = {
      ...settings,
      newsletter: { enabled: false, welcomeCode: ' BIENVENUE10 ' },
      reviews: { enabled: false },
    };
    expect(buildCatalog(products, off, images, now).features).toEqual({
      newsletter: false,
      reviews: false,
      newsletterWelcomeCode: 'BIENVENUE10',
    });
  });
});

describe('buildClientCatalog (embedded rep-catalog)', () => {
  const thumbs = Object.fromEntries(products.fr.map((p) => [p.sku, `/_astro/${p.slug}_160.webp`]));
  it('is filtered to one locale and keyed by sku', () => {
    const c = buildClientCatalog(products.en, settings, 'en', thumbs);
    const source = products.en.find((p) => p.sku === 'REP-HIB-100')!;
    expect(c.locale).toBe('en');
    expect(c.products['REP-HIB-100']).toEqual({
      sku: 'REP-HIB-100',
      slug: 'fleurs-d-hibiscus-bissap-100g',
      url: '/en/products/fleurs-d-hibiscus-bissap-100g/',
      name: 'Hibiscus flowers (bissap) 100 g',
      weightGrams: 100,
      unitAmount: toCents(source.price),
      stock: 'in_stock',
      image: '/_astro/fleurs-d-hibiscus-bissap-100g_160.webp',
      category: 'infusions',
      categoryName: 'infusions',
      keywords: source.keywords,
      related: ['REP-BAO-100', 'REP-SOU-T200'],
      featured: true,
    });
    expect(c.shipping[0]).toEqual({
      id: 'relay',
      amount: 490,
      countries: ['FR', 'BE', 'LU'],
      label: 'Mondial Relay pickup point',
      estimate: '3 to 5 working days',
    });
  });
  it('drops disabled shipping methods', () => {
    const s: Settings = {
      ...settings,
      shipping: settings.shipping.map((m) => (m.id === 'home' ? { ...m, enabled: false } : m)),
    };
    const c = buildClientCatalog(products.fr, s, 'fr', thumbs);
    expect(c.shipping.map((m) => m.id)).toEqual(['relay', 'pickup']);
  });
});

describe('helpers', () => {
  it('labels a product with its weight in plain spaces', () => {
    expect(productLabel('Poudre de cacao', 100, 'fr')).toBe('Poudre de cacao 100 g');
    expect(productLabel('Moringa', 1500, 'en')).toBe('Moringa 1.5 kg');
  });
  it('serialises JSON safe for a script element', () => {
    const out = serializeForScript({ name: '</script><img>' } as unknown as Product);
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual({ name: '</script><img>' });
  });
});
