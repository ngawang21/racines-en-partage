// Build-time content access. Every page and component reads content through
// these loaders, never through getCollection directly, so the French fallback
// and the cross-file checks apply everywhere.
import { getCollection, getEntry } from 'astro:content';
import { DEFAULT_LOCALE, HOST, LOCALES, type Locale } from '../consts';
import { localeSchema, type LocaleContent } from '../content/locale-schema';
import { mergeCategory, mergePage, mergeProduct } from '../content/merge';
import {
  validateCatalog,
  type Category,
  type LegalKey,
  type PageContent,
  type PageKey,
  type Product,
  type Settings,
} from '../content/schemas';
import { hasAsset } from '../images';
import { deepFallback, interpolate, interpolateHtml, pickLabel } from './fallback';
import { formatPhone } from './format';

// `astro:content` is a virtual module that vitest cannot resolve, so the pure
// helpers live in ./fallback and ../content/merge and are re-exported here.
export { deepFallback, interpolate, interpolateHtml, pickLabel };

/** "fr/poudre-de-moringa-100g" to ["fr", "poudre-de-moringa-100g"]. */
function splitId(id: string): [Locale, string] {
  const [locale, ...rest] = id.split('/');
  if (!locale || !LOCALES.includes(locale as Locale) || rest.length !== 1) {
    throw new Error(`content entry "${id}" must live in a fr/ or en/ folder`);
  }
  return [locale as Locale, rest[0] as string];
}

function byLocale<T extends { id: string; data: unknown }>(entries: T[]) {
  const out: Record<Locale, Map<string, unknown>> = { fr: new Map(), en: new Map() };
  for (const e of entries) {
    const [locale, slug] = splitId(e.id);
    out[locale].set(slug, e.data);
  }
  return out;
}

/** UI strings of the locale, every empty field filled from French. */
export async function loadLocale(locale: Locale): Promise<LocaleContent> {
  const read = async (l: Locale) => {
    const found = await getEntry('locales', l);
    if (!found) throw new Error(`missing locale file src/content/locales/${l}.json`);
    // Re-apply the schema: the dev server may keep a cache from an older schema.
    return localeSchema.parse(found.data);
  };
  const fr = await read(DEFAULT_LOCALE);
  if (locale === DEFAULT_LOCALE) return fr;
  return deepFallback(await read(locale), fr);
}

export async function loadSettings(): Promise<Settings> {
  const found = await getEntry('settings', 'shop');
  if (!found) throw new Error('missing src/content/settings/shop.yml');
  return found.data;
}

export async function loadCategories(locale: Locale): Promise<Category[]> {
  const files = byLocale(await getCollection('categories'));
  const list = [...files.fr.entries()].map(([slug, fr]) =>
    mergeCategory(
      slug,
      fr,
      locale === DEFAULT_LOCALE ? undefined : (files[locale].get(slug) ?? {}),
    ),
  );
  for (const c of list) {
    if (!hasAsset(c.image))
      throw new Error(`categories/fr/${c.slug}.yml: missing image ${c.image}`);
  }
  return list.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

/**
 * Every product in the locale, sorted by category order then name. Shared
 * fields come from the French file; the cross-file checks run on each call.
 */
export async function loadProducts(locale: Locale): Promise<Product[]> {
  const files = byLocale(await getCollection('products'));
  const products = [...files.fr.entries()].map(([slug, fr]) =>
    mergeProduct(slug, fr, locale === DEFAULT_LOCALE ? undefined : (files[locale].get(slug) ?? {})),
  );
  const categories = await loadCategories(DEFAULT_LOCALE);
  const problems = validateCatalog({
    products,
    categorySlugs: categories.map((c) => c.slug),
    assetExists: hasAsset,
  });
  if (problems.length > 0)
    throw new Error(`Invalid product catalogue:\n- ${problems.join('\n- ')}`);
  const order = new Map(categories.map((c) => [c.slug, c.order]));
  return products.sort(
    (a, b) =>
      (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0) ||
      a.name.localeCompare(b.name, locale) ||
      a.weightGrams - b.weightGrams,
  );
}

export async function loadProduct(locale: Locale, slug: string): Promise<Product> {
  const found = (await loadProducts(locale)).find((p) => p.slug === slug);
  if (!found) throw new Error(`unknown product "${slug}"`);
  return found;
}

export async function loadPage<K extends PageKey>(locale: Locale, key: K): Promise<PageContent<K>> {
  const files = byLocale(await getCollection('pages'));
  const fr = files.fr.get(key);
  if (fr === undefined) throw new Error(`missing src/content/pages/fr/${key}.yml`);
  return mergePage(key, fr, locale === DEFAULT_LOCALE ? undefined : (files[locale].get(key) ?? {}));
}

/** Values of the `{company}`, `{siren}`, ... tokens of the legal texts. */
export function legalTokens(
  settings: Settings,
  t: LocaleContent,
  locale: Locale,
): Record<string, string> {
  const { brand, shop } = settings;
  const country = new Intl.DisplayNames([locale], { type: 'region' }).of(brand.address.country);
  return {
    company: brand.name,
    siren: brand.siren.trim() || t.legal.sirenPending,
    address: `${brand.address.street}, ${brand.address.postcode} ${brand.address.city}, ${country}`,
    email: brand.email,
    phone: formatPhone(brand.phone),
    host: HOST,
    vat:
      shop.vat.mode === 'franchise'
        ? t.legal.vatFranchise
        : interpolate(t.legal.vatIncluded, {
            rate: new Intl.NumberFormat(locale).format(shop.vat.rate),
          }),
  };
}

export interface LegalText {
  title: string;
  description: string;
  updated: string;
  /** Rendered Markdown with the tokens replaced (values HTML-escaped). */
  html: string;
}

/** A legal Markdown text in the locale (French when the translation is missing). */
export async function loadLegal(locale: Locale, key: LegalKey): Promise<LegalText> {
  const entry =
    (await getEntry('legal', `${locale}/${key}`)) ??
    (await getEntry('legal', `${DEFAULT_LOCALE}/${key}`));
  if (!entry) throw new Error(`missing src/content/legal/fr/${key}.md`);
  const tokens = legalTokens(await loadSettings(), await loadLocale(locale), locale);
  return {
    title: entry.data.title,
    description: entry.data.description,
    updated: entry.data.updated,
    html: interpolateHtml(entry.rendered?.html ?? '', tokens),
  };
}
