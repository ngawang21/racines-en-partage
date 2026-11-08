import { describe, expect, it } from 'vitest';
import {
  NOINDEX_ROUTES,
  ROUTES,
  alternatesFor,
  getLocaleFromUrl,
  isIndexable,
  matchRoute,
  noindexPathFragments,
  routePath,
  routeUrl,
  type RouteKey,
} from '../../src/i18n/routing';

describe('route table (spec section 3)', () => {
  it('maps every key to its French and English path', () => {
    expect(ROUTES).toEqual({
      home: { fr: '/', en: '/en/' },
      shop: { fr: '/boutique/', en: '/en/shop/' },
      category: { fr: '/boutique/[slug]/', en: '/en/shop/[slug]/' },
      product: { fr: '/produits/[slug]/', en: '/en/products/[slug]/' },
      about: { fr: '/notre-histoire/', en: '/en/our-story/' },
      faq: { fr: '/faq/', en: '/en/faq/' },
      contact: { fr: '/contact/', en: '/en/contact/' },
      cart: { fr: '/panier/', en: '/en/cart/' },
      checkout: { fr: '/commande/', en: '/en/checkout/' },
      thanks: { fr: '/merci/', en: '/en/thank-you/' },
      legal: { fr: '/mentions-legales/', en: '/en/legal-notice/' },
      terms: { fr: '/cgv/', en: '/en/terms-of-sale/' },
      privacy: { fr: '/confidentialite/', en: '/en/privacy/' },
      recipes: { fr: '/recettes/', en: '/en/recipes/' },
      lookup: { fr: '/ma-commande/', en: '/en/my-order/' },
      review: { fr: '/avis/', en: '/en/review/' },
      newsletter: { fr: '/newsletter/', en: '/en/newsletter/' },
      account: { fr: '/mon-compte/', en: '/en/account/' },
      notFound: { fr: '/404.html', en: '/404.html' },
      admin: { fr: '/admin/', en: '/admin/' },
    });
  });
  it('every page path ends with a slash, except the 404 file', () => {
    for (const [key, paths] of Object.entries(ROUTES)) {
      for (const p of Object.values(paths)) {
        if (key !== 'notFound') expect(p.endsWith('/'), p).toBe(true);
      }
    }
  });
  it('marks cart, checkout, thanks, review, newsletter, 404 and admin noindex', () => {
    expect([...NOINDEX_ROUTES].sort()).toEqual([
      'account',
      'admin',
      'cart',
      'checkout',
      'newsletter',
      'notFound',
      'review',
      'thanks',
    ]);
    expect(isIndexable('product')).toBe(true);
    expect(isIndexable('cart')).toBe(false);
  });
});

describe('routePath and routeUrl', () => {
  it('fills the slug of category and product routes', () => {
    expect(routePath('product', 'fr', 'poudre-de-moringa-100g')).toBe(
      '/produits/poudre-de-moringa-100g/',
    );
    expect(routePath('category', 'en', 'cacao')).toBe('/en/shop/cacao/');
    expect(() => routePath('product', 'fr')).toThrow(/slug/);
  });
  it('ignores a slug on routes without one', () => {
    expect(routePath('faq', 'en', 'whatever')).toBe('/en/faq/');
  });
  it('builds absolute URLs on the production domain', () => {
    expect(routeUrl('home', 'fr')).toBe('https://racinesenpartage.fr/');
    expect(routeUrl('thanks', 'en')).toBe('https://racinesenpartage.fr/en/thank-you/');
  });
});

describe('alternatesFor', () => {
  it('lists fr, en and x-default on French', () => {
    expect(alternatesFor('product', 'grues-de-cacao-100g')).toEqual([
      { hreflang: 'fr', href: 'https://racinesenpartage.fr/produits/grues-de-cacao-100g/' },
      { hreflang: 'en', href: 'https://racinesenpartage.fr/en/products/grues-de-cacao-100g/' },
      { hreflang: 'x-default', href: 'https://racinesenpartage.fr/produits/grues-de-cacao-100g/' },
    ]);
  });
});

describe('matchRoute', () => {
  it('finds the key, locale and slug of every path', () => {
    for (const key of Object.keys(ROUTES) as RouteKey[]) {
      for (const locale of ['fr', 'en'] as const) {
        const slug = key === 'category' || key === 'product' ? 'some-slug-1' : undefined;
        const found = matchRoute(routePath(key, locale, slug));
        expect(found?.key, `${key} ${locale}`).toBe(key);
        if (key !== 'notFound' && key !== 'admin') expect(found?.locale).toBe(locale);
        expect(found?.slug).toBe(slug);
      }
    }
  });
  it('returns null for an unknown path', () => {
    expect(matchRoute('/nope/')).toBeNull();
    expect(matchRoute('/produits/')).toBeNull();
  });
});

describe('helpers', () => {
  it('reads the locale from a URL', () => {
    expect(getLocaleFromUrl(new URL('https://racinesenpartage.fr/en/shop/'))).toBe('en');
    expect(getLocaleFromUrl(new URL('https://racinesenpartage.fr/boutique/'))).toBe('fr');
  });
  it('gives the sitemap filter every noindex path, never the home', () => {
    expect(noindexPathFragments().sort()).toEqual(
      [
        '/404.html',
        '/admin/',
        '/commande/',
        '/en/cart/',
        '/en/checkout/',
        '/en/thank-you/',
        '/avis/',
        '/en/account/',
        '/en/newsletter/',
        '/en/review/',
        '/merci/',
        '/mon-compte/',
        '/newsletter/',
        '/panier/',
      ].sort(),
    );
  });
});
