import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type HTMLElement } from 'node-html-parser';
import { beforeAll, describe, expect, it } from 'vitest';
import { settingsSchema } from '../../src/content/schemas';
import { ROUTES, isIndexable, routePath, routeUrl, type RouteKey } from '../../src/i18n/routing';
import { CONTENT, readYaml, yamlFolder } from '../unit/helpers';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const read = (p: string) => readFileSync(join(dist, p), 'utf8');
const html = (p: string) => parse(read(p));
const SITE = 'https://racinesenpartage.fr';

const LOCALES = ['fr', 'en'] as const;
const productSlugs = [...yamlFolder('products', 'fr').keys()];
const categorySlugs = [...yamlFolder('categories', 'fr').keys()];
const settings = settingsSchema.parse(readYaml(join(CONTENT, 'settings/shop.yml')));

/** dist file of a route path: "/boutique/" -> "boutique/index.html". */
const fileOf = (path: string) =>
  path.endsWith('.html') ? path.slice(1) : `${path.slice(1)}index.html`;

interface Page {
  key: RouteKey;
  locale: (typeof LOCALES)[number];
  slug?: string;
  file: string;
}
const PAGES: Page[] = (Object.keys(ROUTES) as RouteKey[])
  .filter((key) => key !== 'admin' && key !== 'notFound')
  .flatMap((key) =>
    LOCALES.flatMap((locale) => {
      const slugs =
        key === 'product' ? productSlugs : key === 'category' ? categorySlugs : [undefined];
      return slugs.map((slug) => ({
        key,
        locale,
        slug,
        file: fileOf(routePath(key, locale, slug)),
      }));
    }),
  );
const NOT_FOUND: Page = { key: 'notFound', locale: 'fr', file: '404.html' };
const ALL = [...PAGES, NOT_FOUND];

const docs = new Map<string, HTMLElement>();
const doc = (file: string) => {
  let d = docs.get(file);
  if (!d) {
    d = html(file);
    docs.set(file, d);
  }
  return d;
};
const ldGraph = (file: string): Array<Record<string, any>> => {
  const raw = doc(file).querySelector('script[type="application/ld+json"]')?.text ?? '';
  return JSON.parse(raw)['@graph'];
};

beforeAll(() => {
  if (!existsSync(dist)) throw new Error('dist/ is missing: run pnpm build first');
});

describe('routes', () => {
  it('builds every route of spec section 3 in both locales', () => {
    expect(PAGES.length).toBe(2 * (11 + productSlugs.length + categorySlugs.length));
    for (const p of ALL) expect(existsSync(join(dist, p.file)), p.file).toBe(true);
  });
  it('writes catalog.json, the sitemap and robots.txt', () => {
    for (const f of ['catalog.json', 'sitemap-index.xml', 'robots.txt'])
      expect(existsSync(join(dist, f)), f).toBe(true);
  });
  it('sets the html lang of the page locale', () => {
    for (const p of ALL)
      expect(doc(p.file).querySelector('html')?.getAttribute('lang'), p.file).toBe(p.locale);
  });
  it('every page has one h1 and a real description', () => {
    for (const p of ALL) {
      expect(doc(p.file).querySelectorAll('h1').length, p.file).toBe(1);
      const desc = doc(p.file).querySelector('meta[name="description"]')?.getAttribute('content');
      expect(desc?.length ?? 0, p.file).toBeGreaterThan(20);
    }
  });
});

describe('seo', () => {
  it('exactly one JSON-LD script per page, valid JSON with one @graph', () => {
    for (const p of ALL) {
      const blocks = doc(p.file).querySelectorAll('script[type="application/ld+json"]');
      expect(blocks.length, p.file).toBe(1);
      const data = JSON.parse(blocks[0]!.text);
      expect(data['@context'], p.file).toBe('https://schema.org');
      expect(Array.isArray(data['@graph']), p.file).toBe(true);
      expect(data['@graph'][0]['@type'], p.file).toBe('OnlineStore');
    }
  });
  it('a robots meta on every page, noindex exactly on cart, checkout, thanks and 404', () => {
    for (const p of ALL) {
      const robots =
        doc(p.file).querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
      expect(robots.length, p.file).toBeGreaterThan(0);
      expect(robots.includes('noindex'), p.file).toBe(!isIndexable(p.key));
    }
  });
  it('canonical on every page, hreflang fr, en, x-default only when indexable', () => {
    for (const p of PAGES) {
      const d = doc(p.file);
      expect(d.querySelector('link[rel="canonical"]')?.getAttribute('href'), p.file).toBe(
        routeUrl(p.key, p.locale, p.slug),
      );
      const alternates = d
        .querySelectorAll('link[rel="alternate"][hreflang]')
        .map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]);
      if (isIndexable(p.key)) {
        expect(alternates, p.file).toEqual([
          ['fr', routeUrl(p.key, 'fr', p.slug)],
          ['en', routeUrl(p.key, 'en', p.slug)],
          ['x-default', routeUrl(p.key, 'fr', p.slug)],
        ]);
      } else {
        expect(alternates, p.file).toEqual([]);
      }
    }
    expect(doc('404.html').querySelectorAll('link[rel="alternate"][hreflang]').length).toBe(0);
  });
  it('the Open Graph image of every page exists in dist', () => {
    for (const p of ALL) {
      const url = doc(p.file).querySelector('meta[property="og:image"]')?.getAttribute('content');
      expect(url?.startsWith(`${SITE}/`), p.file).toBe(true);
      expect(existsSync(join(dist, url!.slice(SITE.length))), url).toBe(true);
    }
  });
  it('product pages carry a Product with its Offer, collection pages a CollectionPage', () => {
    const products = new Map(
      [...yamlFolder('products', 'fr')].map(([slug, raw]) => [slug, raw as Record<string, any>]),
    );
    for (const p of PAGES.filter((q) => q.key === 'product')) {
      const product = ldGraph(p.file).find((n) => n['@type'] === 'Product');
      const src = products.get(p.slug!)!;
      expect(product?.sku, p.file).toBe(src.sku);
      expect(product?.offers.price, p.file).toBe(Number(src.price).toFixed(2));
      expect(product?.offers.priceCurrency).toBe('EUR');
    }
    for (const p of PAGES.filter((q) => q.key === 'shop' || q.key === 'category')) {
      expect(
        ldGraph(p.file).some((n) => n['@type'] === 'CollectionPage'),
        p.file,
      ).toBe(true);
      expect(
        ldGraph(p.file).some((n) => n['@type'] === 'BreadcrumbList'),
        p.file,
      ).toBe(true);
    }
    for (const locale of LOCALES) {
      const file = fileOf(routePath('faq', locale));
      expect(
        ldGraph(file).find((n) => n['@type'] === 'FAQPage')?.mainEntity.length,
      ).toBeGreaterThan(5);
    }
  });
  it('the sitemap lists indexable pages with alternates and no noindex route', () => {
    const xml = readdirSync(dist)
      .filter((f) => /^sitemap-\d+\.xml$/.test(f))
      .map((f) => read(f))
      .join('');
    for (const p of PAGES) {
      const loc = `<loc>${routeUrl(p.key, p.locale, p.slug)}</loc>`;
      expect(xml.includes(loc), loc).toBe(isIndexable(p.key));
    }
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${SITE}/en/shop/"/>`);
    expect(xml).not.toContain('/admin/');
    expect(xml).not.toContain('404');
  });
});

describe('hygiene', () => {
  it('no inline executable script: only JSON data blocks may be inline', () => {
    for (const p of ALL) {
      for (const s of doc(p.file).querySelectorAll('script')) {
        const type = s.getAttribute('type') ?? '';
        if (type === 'application/ld+json' || type === 'application/json') continue;
        expect(s.getAttribute('src'), `${p.file} has an inline script`).toBeTruthy();
      }
    }
  });
  it('no localhost or filesystem path leaks', () => {
    for (const p of ALL)
      expect(read(p.file), p.file).not.toMatch(/localhost|127\.0\.0\.1|\/home\//);
  });
  it('no interpolation token survives in a page', () => {
    const token =
      /\{(company|siren|address|email|phone|host|vat|year|price|threshold|count|name|amount|date)\}/;
    for (const p of ALL) expect(read(p.file), p.file).not.toMatch(token);
  });
  it('the legal pages carry the contact details from the settings', () => {
    for (const locale of LOCALES) {
      const text = read(fileOf(routePath('legal', locale)));
      expect(text).toContain('racinesenpartage@outlook.com');
      expect(text).toContain('07 75 68 91 08');
      expect(text).toContain('Cloudflare');
    }
  });
  it('every internal link resolves to a built file', () => {
    for (const p of ALL) {
      const hrefs = doc(p.file)
        .querySelectorAll('a[href]')
        .map((a) => a.getAttribute('href') ?? '')
        .filter((h) => h.startsWith('/'));
      for (const h of hrefs) {
        const path = h.split('#')[0]!;
        const ok = [join(dist, path), join(dist, path, 'index.html')].some(
          (c) => existsSync(c) && statSync(c).isFile(),
        );
        expect(ok, `${p.file} -> ${h}`).toBe(true);
      }
    }
  });
});

describe('contracts for wave 2', () => {
  it('the header cart button and the drawer placeholder follow the markup contract', () => {
    for (const p of ALL) {
      const d = doc(p.file);
      const button = d.querySelector('button[data-cart-toggle]');
      expect(button?.getAttribute('type'), p.file).toBe('button');
      expect(button?.getAttribute('aria-controls'), p.file).toBe('cart-drawer');
      expect(button?.querySelector('[data-cart-count]'), p.file).not.toBeNull();
      expect(d.querySelectorAll('#cart-drawer').length, p.file).toBe(1);
    }
  });
  it('product pages expose an add-to-cart button with the sku', () => {
    for (const p of PAGES.filter((q) => q.key === 'product')) {
      const button = doc(p.file).querySelector('button[data-add-to-cart]');
      expect(button?.getAttribute('data-sku'), p.file).toMatch(/^REP-/);
      expect(button?.getAttribute('type')).toBe('button');
    }
  });
  it('the body tells the cart script whether the shop is open', () => {
    expect(doc('index.html').querySelector('body')?.getAttribute('data-shop-open')).toBe(
      String(settings.shop.open),
    );
  });
});

describe('catalog.json (spec 6.2)', () => {
  const catalog = () => JSON.parse(read('catalog.json'));
  it('is valid and carries the settings in cents', () => {
    const c = catalog();
    expect(new Date(c.generatedAt).toISOString()).toBe(c.generatedAt);
    expect(c.currency).toBe('eur');
    expect(c.vatMode).toBe(settings.shop.vat.mode);
    expect(c.shopOpen).toBe(settings.shop.open);
    expect(c.maxQuantityPerLine).toBe(settings.shop.maxQuantityPerLine);
    expect(c.freeShippingFrom).toBe(Math.round((settings.shop.freeShippingFrom ?? 0) * 100));
    expect(c.shipping.map((s: any) => [s.id, s.enabled, s.amount, s.countries])).toEqual(
      settings.shipping.map((s) => [s.id, s.enabled, Math.round(s.price * 100), s.countries]),
    );
  });
  it('matches the product files: skus, amounts, stock and names', () => {
    const c = catalog();
    const files = [...yamlFolder('products', 'fr')].map(
      ([slug, raw]) => ({ ...(raw as Record<string, any>), slug }) as Record<string, any>,
    );
    expect(c.products.map((p: any) => p.sku).sort()).toEqual(files.map((f) => f.sku).sort());
    for (const f of files) {
      const p = c.products.find((q: any) => q.sku === f.sku);
      expect(p.slug).toBe(f.slug);
      expect(p.unitAmount, f.sku).toBe(Math.round(f.price * 100));
      expect(Number.isInteger(p.unitAmount)).toBe(true);
      expect(p.stock).toBe(f.stock);
      expect(p.weightGrams).toBe(f.weightGrams);
      expect(p.name.fr.startsWith(f.name)).toBe(true);
      expect(p.name.en.length).toBeGreaterThan(0);
    }
  });
  it('points every product at an absolute 800 px WebP that exists in dist', () => {
    for (const p of catalog().products) {
      expect(p.image.startsWith(`${SITE}/_astro/`), p.sku).toBe(true);
      expect(p.image.endsWith('.webp'), p.sku).toBe(true);
      expect(existsSync(join(dist, p.image.slice(SITE.length))), p.image).toBe(true);
    }
  });
});
