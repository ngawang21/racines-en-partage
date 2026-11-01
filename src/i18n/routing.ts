import { DEFAULT_LOCALE, LOCALES, SITE, type Locale } from '../consts';

/** Every route of spec section 3. `notFound` is the `404` row, `admin` the Sveltia page. */
export type RouteKey =
  | 'home'
  | 'shop'
  | 'category'
  | 'product'
  | 'about'
  | 'faq'
  | 'contact'
  | 'cart'
  | 'checkout'
  | 'thanks'
  | 'legal'
  | 'terms'
  | 'privacy'
  | 'notFound'
  | 'admin';

/**
 * Path per route and locale. `category` and `product` carry a `[slug]` token
 * replaced by routePath. Product and category slugs are the same in both locales.
 */
export const ROUTES: Record<RouteKey, Record<Locale, string>> = {
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
  notFound: { fr: '/404.html', en: '/404.html' },
  admin: { fr: '/admin/', en: '/admin/' },
};

/** Routes that carry `noindex`, no hreflang alternates and stay out of the sitemap. */
export const NOINDEX_ROUTES: readonly RouteKey[] = [
  'cart',
  'checkout',
  'thanks',
  'notFound',
  'admin',
];

const SLUG_ROUTES: readonly RouteKey[] = ['category', 'product'];

export function isIndexable(key: RouteKey): boolean {
  return !NOINDEX_ROUTES.includes(key);
}

export function routePath(key: RouteKey, locale: Locale, slug?: string): string {
  const path = ROUTES[key][locale];
  if (!SLUG_ROUTES.includes(key)) return path;
  if (!slug) throw new Error(`routePath("${key}") needs a slug`);
  return path.replace('[slug]', slug);
}

export function routeUrl(key: RouteKey, locale: Locale, slug?: string): string {
  return new URL(routePath(key, locale, slug), SITE.url).href;
}

export function getLocaleFromUrl(url: URL): Locale {
  const [first] = url.pathname.split('/').filter(Boolean);
  return (LOCALES as readonly string[]).includes(first ?? '') ? (first as Locale) : DEFAULT_LOCALE;
}

/** hreflang set of an indexable page: every locale, then x-default on French. */
export function alternatesFor(
  key: RouteKey,
  slug?: string,
): Array<{ hreflang: string; href: string }> {
  const entries = LOCALES.map((l) => ({ hreflang: l, href: routeUrl(key, l, slug) }));
  return [...entries, { hreflang: 'x-default', href: routeUrl(key, DEFAULT_LOCALE, slug) }];
}

/** The route, locale and slug a site path belongs to, or null when no route matches. */
export function matchRoute(
  pathname: string,
): { key: RouteKey; locale: Locale; slug?: string } | null {
  for (const key of Object.keys(ROUTES) as RouteKey[]) {
    for (const locale of LOCALES) {
      const pattern = ROUTES[key][locale];
      if (!SLUG_ROUTES.includes(key)) {
        if (pattern === pathname) return { key, locale };
        continue;
      }
      const [head, tail] = pattern.split('[slug]') as [string, string];
      if (pathname.startsWith(head) && pathname.endsWith(tail)) {
        const slug = pathname.slice(head.length, pathname.length - tail.length);
        if (/^[a-z0-9-]+$/.test(slug)) return { key, locale, slug };
      }
    }
  }
  return null;
}

/**
 * Path fragments of every noindex route, for the sitemap filter in
 * astro.config.mjs (it matches absolute page URLs by substring).
 */
export function noindexPathFragments(): string[] {
  return NOINDEX_ROUTES.flatMap((key) => LOCALES.map((l) => ROUTES[key][l])).filter(
    (p, i, all) => p !== '/' && all.indexOf(p) === i,
  );
}
