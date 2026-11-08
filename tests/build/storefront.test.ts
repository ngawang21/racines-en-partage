// Storefront checks over dist/ (wave 2A): structured data, Open Graph cards,
// the shop toolbar, the add-to-cart contract and the product page sections.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type HTMLElement } from 'node-html-parser';
import { beforeAll, describe, expect, it } from 'vitest';
import { settingsSchema } from '../../src/content/schemas';
import { routePath } from '../../src/i18n/routing';
import { CONTENT, readYaml, yamlFolder } from '../unit/helpers';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const SITE = 'https://racinesenpartage.fr';
const LOCALES = ['fr', 'en'] as const;
const products = [...yamlFolder('products', 'fr')].map(
  ([slug, raw]) => ({ ...(raw as Record<string, any>), slug }) as Record<string, any>,
);
const categorySlugs = [...yamlFolder('categories', 'fr').keys()];
const settings = settingsSchema.parse(readYaml(join(CONTENT, 'settings/shop.yml')));

const fileOf = (path: string) =>
  path.endsWith('.html') ? path.slice(1) : `${path.slice(1)}index.html`;
const cache = new Map<string, HTMLElement>();
const doc = (path: string) => {
  const file = fileOf(path);
  let d = cache.get(file);
  if (!d) {
    d = parse(readFileSync(join(dist, file), 'utf8'));
    cache.set(file, d);
  }
  return d;
};
const graph = (path: string): Array<Record<string, any>> =>
  JSON.parse(doc(path).querySelector('script[type="application/ld+json"]')!.text)['@graph'];

const storefront = LOCALES.flatMap((l) => [
  routePath('home', l),
  routePath('shop', l),
  ...categorySlugs.map((s) => routePath('category', l, s)),
  ...products.map((p) => routePath('product', l, p.slug)),
  routePath('about', l),
  routePath('faq', l),
  routePath('contact', l),
  routePath('legal', l),
  routePath('terms', l),
  routePath('privacy', l),
]).concat('/404.html');

beforeAll(() => {
  if (!existsSync(dist)) throw new Error('dist/ is missing: run pnpm build first');
});

describe('structured data', () => {
  it('every product page carries a Product with an Offer matching the file', () => {
    for (const l of LOCALES)
      for (const p of products) {
        const node = graph(routePath('product', l, p.slug)).find((n) => n['@type'] === 'Product');
        expect(node?.sku, p.slug).toBe(p.sku);
        expect(node?.offers?.['@type'], p.slug).toBe('Offer');
        expect(node?.offers?.price, p.slug).toBe(Number(p.price).toFixed(2));
        expect(node?.offers?.priceCurrency).toBe('EUR');
      }
  });
  it('the FAQ pages carry a FAQPage with one question per item', () => {
    for (const l of LOCALES) {
      const faq = graph(routePath('faq', l)).find((n) => n['@type'] === 'FAQPage');
      const items = (readYaml(join(CONTENT, `pages/fr/faq.yml`)) as any).items;
      expect(faq?.mainEntity.length).toBe(items.length);
      expect(doc(routePath('faq', l)).querySelectorAll('.faq-list details').length).toBe(
        items.length,
      );
    }
  });
});

describe('open graph cards', () => {
  it('every product has its own 1200 x 630 card, other pages the default one', () => {
    expect(existsSync(join(dist, 'og/default.jpg'))).toBe(true);
    for (const l of LOCALES) {
      for (const p of products) {
        const d = doc(routePath('product', l, p.slug));
        const url = d.querySelector('meta[property="og:image"]')?.getAttribute('content');
        expect(url).toBe(`${SITE}/og/${p.slug}.jpg`);
        expect(existsSync(join(dist, 'og', `${p.slug}.jpg`)), p.slug).toBe(true);
        expect(d.querySelector('meta[property="og:image:width"]')?.getAttribute('content')).toBe(
          '1200',
        );
        expect(d.querySelector('meta[property="og:image:height"]')?.getAttribute('content')).toBe(
          '630',
        );
      }
      const home = doc(routePath('home', l));
      expect(home.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
        `${SITE}/og/default.jpg`,
      );
    }
  });
});

describe('shop page', () => {
  it('has the category chips, the sort select and one card per product family', () => {
    for (const l of LOCALES) {
      const d = doc(routePath('shop', l));
      const chips = d.querySelectorAll('button[data-filter]');
      const values = chips.map((c) => c.getAttribute('data-filter') ?? '');
      expect(values[0]).toBe('all');
      expect(values.slice(1).sort()).toEqual([...categorySlugs].sort());
      expect(chips.filter((c) => c.getAttribute('aria-pressed') === 'true').length).toBe(1);
      for (const c of chips) expect(c.getAttribute('type')).toBe('button');
      expect(d.querySelectorAll('select[data-sort] option').length).toBe(4);
      // Formats of one product (moringa 100 g and 200 g) share a card, whose
      // chips link every format.
      const families = new Set(
        products.map((p) => `${p.category}|${String(p.name).trim().toLocaleLowerCase('fr')}`),
      );
      const cards = d.querySelectorAll('[data-product-card]');
      expect(cards.length).toBe(families.size);
      const linked = new Set(
        cards.flatMap((c) => c.querySelectorAll('a').map((a) => a.getAttribute('href'))),
      );
      for (const p of products)
        expect(linked.has(routePath('product', l, p.slug)), p.slug).toBe(true);
      for (const c of cards) {
        expect(c.getAttribute('data-category')).toBeTruthy();
        expect(Number(c.getAttribute('data-price'))).toBeGreaterThan(0);
        expect(c.getAttribute('data-name')).toBeTruthy();
      }
      expect(d.querySelector('script[type="module"][src]')).not.toBeNull();
    }
  });
});

describe('add-to-cart contract', () => {
  it('every add button is a typed button with the sku; out of stock and closed shop disable it', () => {
    const bySku = new Map(products.map((p) => [p.sku, p]));
    for (const path of storefront) {
      for (const b of doc(path).querySelectorAll('[data-add-to-cart]')) {
        expect(b.tagName, path).toBe('BUTTON');
        expect(b.getAttribute('type'), path).toBe('button');
        const p = bySku.get(b.getAttribute('data-sku') ?? '');
        expect(p, `${path} unknown sku`).toBeDefined();
        const disabled = b.hasAttribute('disabled');
        if (p!.stock === 'out') expect(b.getAttribute('data-stock')).toBe('out');
        expect(disabled, path).toBe(p!.stock === 'out' || !settings.shop.open);
        expect(b.hasAttribute('data-shop-closed'), path).toBe(!settings.shop.open);
      }
    }
  });
  it('product pages have the quantity input and its stepper buttons', () => {
    for (const l of LOCALES)
      for (const p of products) {
        const d = doc(routePath('product', l, p.slug));
        const input = d.querySelector(`input[data-qty-for="${p.sku}"]`);
        expect(input?.getAttribute('type')).toBe('number');
        expect(input?.getAttribute('min')).toBe('1');
        expect(input?.getAttribute('max')).toBe(String(settings.shop.maxQuantityPerLine));
        const id = input?.getAttribute('id');
        for (const step of ['-1', '1']) {
          const b = d.querySelector(`button[data-qty-step="${step}"]`);
          expect(b?.getAttribute('aria-controls'), p.slug).toBe(id);
        }
      }
  });
});

describe('product page', () => {
  it('shows the nutrition table only when verified, and the disclaimer always', () => {
    for (const l of LOCALES)
      for (const p of products) {
        const d = doc(routePath('product', l, p.slug));
        expect(d.querySelectorAll('table.nutrition').length, p.slug).toBe(
          p.nutritionVerified ? 1 : 0,
        );
        expect(d.querySelector('.footnote')?.text.length ?? 0).toBeGreaterThan(40);
        expect(d.querySelectorAll('[data-gallery-slide]').length).toBeGreaterThanOrEqual(1);
        if (p.recipe) expect(d.querySelector('#recipe'), p.slug).not.toBeNull();
      }
  });
});

describe('hygiene', () => {
  it('no inline executable script on storefront pages', () => {
    for (const path of storefront)
      for (const s of doc(path).querySelectorAll('script')) {
        const type = s.getAttribute('type') ?? '';
        if (type === 'application/ld+json' || type === 'application/json') continue;
        expect(s.getAttribute('src'), `${path} has an inline script`).toBeTruthy();
      }
  });
  it('the hero image loads eagerly with high priority', () => {
    for (const l of LOCALES) {
      const img = doc(routePath('home', l)).querySelector('.hero-frame img');
      expect(img?.getAttribute('loading')).toBe('eager');
      expect(img?.getAttribute('fetchpriority')).toBe('high');
    }
  });
});
