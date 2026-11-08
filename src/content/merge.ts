// Locale merging of spec section 4: shared fields from the French file only,
// translated fields from the locale file with French filling every gap.
// Pure (no Astro import) so vitest covers it.
import { z } from 'zod';
import { deepFallback } from '../i18n/fallback';
import {
  CATEGORY_TRANSLATED_KEYS,
  PAGE_SCHEMAS,
  PRODUCT_TRANSLATED_KEYS,
  categorySchema,
  categoryTranslatedSchema,
  categoryTranslationSchema,
  productSchema,
  productTranslatedSchema,
  productTranslationSchema,
  type Category,
  type PageContent,
  type PageKey,
  type Product,
  type Review,
} from './schemas';

/** schema.parse with the file named in the error, readable in a build log. */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown, where: string) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid content in ${where}:\n${z.prettifyError(result.error)}`);
  }
  return result.data as z.output<S>;
}

function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** French product, or the English one when `enRaw` is given (it may be partial). */
export function mergeProduct(slug: string, frRaw: unknown, enRaw?: unknown): Product {
  const fr = parseOrThrow(productSchema, frRaw, `products/fr/${slug}.yml`);
  if (enRaw === undefined) return { ...fr, slug };
  const en = parseOrThrow(productTranslationSchema, enRaw ?? {}, `products/en/${slug}.yml`);
  const merged = deepFallback(en as unknown, pick(fr, PRODUCT_TRANSLATED_KEYS) as unknown);
  const translated = parseOrThrow(
    productTranslatedSchema,
    merged,
    `products/en/${slug}.yml (after French fallback)`,
  );
  return { ...fr, ...translated, slug };
}

/**
 * Drop the `related` links to a product that no longer exists, so deleting a
 * product in the CMS never fails the build because another file still lists
 * it. Returns the cleaned products and the dropped links ("from -> to"), which
 * the loader prints as a build warning.
 */
export function dropDanglingRelated(products: Product[]): {
  products: Product[];
  dropped: string[];
} {
  const known = new Set(products.map((p) => p.slug));
  const dropped: string[] = [];
  const cleaned = products.map((p) => {
    const kept = p.related.filter((r) => known.has(r));
    if (kept.length === p.related.length) return p;
    for (const r of p.related) if (!known.has(r)) dropped.push(`${p.slug} -> ${r}`);
    return { ...p, related: kept };
  });
  return { products: cleaned, dropped };
}

/**
 * The products the site shows: those marked `hidden` are left out, and so are
 * the `related` links that point to them. Order is kept.
 */
export function publishedProducts(products: Product[]): Product[] {
  const hidden = new Set(products.filter((p) => p.hidden).map((p) => p.slug));
  if (hidden.size === 0) return products;
  return products
    .filter((p) => !p.hidden)
    .map((p) =>
      p.related.some((r) => hidden.has(r))
        ? { ...p, related: p.related.filter((r) => !hidden.has(r)) }
        : p,
    );
}

/**
 * Catalogue order: category order, then the position set with the CMS
 * "Réorganiser" mode (missing last), then name and weight.
 */
export function compareProducts(
  categoryOrder: ReadonlyMap<string, number>,
  locale: string,
): (a: Product, b: Product) => number {
  const position = (p: Product) => p.order ?? Number.POSITIVE_INFINITY;
  return (a, b) =>
    (categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0) ||
    (position(a) === position(b) ? 0 : position(a) < position(b) ? -1 : 1) ||
    a.name.localeCompare(b.name, locale) ||
    a.weightGrams - b.weightGrams;
}

/**
 * The shop's default order ("Nos incontournables"): the featured products
 * first, in catalogue order (the home page selection, in the same order),
 * then the rest of the catalogue. Pass the products in catalogue order
 * (compareProducts); the partition is stable.
 */
export function featuredFirst<T extends Pick<Product, 'featured'>>(products: readonly T[]): T[] {
  return [...products.filter((p) => p.featured), ...products.filter((p) => !p.featured)];
}

export function mergeCategory(slug: string, frRaw: unknown, enRaw?: unknown): Category {
  const fr = parseOrThrow(categorySchema, frRaw, `categories/fr/${slug}.yml`);
  if (enRaw === undefined) return { ...fr, slug };
  const en = parseOrThrow(categoryTranslationSchema, enRaw ?? {}, `categories/en/${slug}.yml`);
  const merged = deepFallback(en as unknown, pick(fr, CATEGORY_TRANSLATED_KEYS) as unknown);
  const translated = parseOrThrow(
    categoryTranslatedSchema,
    merged,
    `categories/en/${slug}.yml (after French fallback)`,
  );
  return { ...fr, ...translated, slug };
}

export function mergePage<K extends PageKey>(
  key: K,
  frRaw: unknown,
  enRaw?: unknown,
): PageContent<K> {
  const schema = PAGE_SCHEMAS[key];
  const fr = parseOrThrow(schema, frRaw, `pages/fr/${key}.yml`);
  if (enRaw === undefined) return fr as PageContent<K>;
  return parseOrThrow(
    schema,
    deepFallback(enRaw ?? {}, fr as unknown),
    `pages/en/${key}.yml (after French fallback)`,
  ) as PageContent<K>;
}

/**
 * The formats of a product (spec 2.5): the products of the same category with
 * the same French name (moringa 100 g and 200 g), the product itself included,
 * lightest first. `name` is shared through the French file, so pass products
 * merged in French, or in any locale whose names are translated together. A
 * list of one means there is no other format and no "Format" row.
 */
export function formatsOf(product: Product, all: readonly Product[]): Product[] {
  const key = (p: Product) => p.name.trim().toLocaleLowerCase('fr');
  const family = all.filter(
    (p) => p.category === product.category && key(p) === key(product) && p.slug !== product.slug,
  );
  return [product, ...family].sort(
    (a, b) => a.weightGrams - b.weightGrams || a.slug.localeCompare(b.slug),
  );
}

/**
 * The family of every product: slug to the slug of the lightest format of
 * its family (formatsOf). Pass products merged in French, the language that
 * defines a family; the map then serves every locale.
 */
export function formatFamilies(all: readonly Product[]): Map<string, string> {
  return new Map(all.map((p) => [p.slug, formatsOf(p, all)[0]!.slug]));
}

/** One card of a grid: a product family shown through its lightest format. */
export interface ProductGroup {
  /** The format the card shows and adds to the cart: the lightest one. */
  lead: Product;
  /** Every format of the family, lightest first; one item when there is no other. */
  formats: Product[];
}

/**
 * One group per product family (moringa 100 g and 200 g make one card), in
 * the order of the first member met in `products`. Each group lists the
 * family's formats taken from `all`, so a home selection holding only the
 * 100 g still offers the 200 g. A slug missing from `families` is its own
 * family.
 */
export function groupFormats(
  products: readonly Product[],
  all: readonly Product[] = products,
  families: ReadonlyMap<string, string> = formatFamilies(all),
): ProductGroup[] {
  const key = (p: Product) => families.get(p.slug) ?? p.slug;
  const groups: ProductGroup[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const k = key(product);
    if (seen.has(k)) continue;
    seen.add(k);
    const members = all.filter((p) => key(p) === k);
    const formats = (members.some((p) => p.slug === product.slug) ? members : [product, ...members])
      .slice()
      .sort((a, b) => a.weightGrams - b.weightGrams || a.slug.localeCompare(b.slug));
    groups.push({ lead: formats[0]!, formats });
  }
  return groups;
}

/**
 * "Dans le même esprit" of a product page: `limit` other products, one
 * format each (the lightest), never a format of the product itself. Taken in
 * this order: the owner's `related` links, the same category, the featured
 * products of other categories, then the rest of the catalogue, so the row is
 * always full when the catalogue allows it.
 */
export function relatedProducts(
  product: Product,
  all: readonly Product[],
  families: ReadonlyMap<string, string> = formatFamilies(all),
  limit = 4,
): Product[] {
  const key = (p: Product) => families.get(p.slug) ?? p.slug;
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  const candidates = [
    ...product.related.map((s) => bySlug.get(s)).filter((p): p is Product => p !== undefined),
    ...all.filter((p) => p.category === product.category),
    ...all.filter((p) => p.featured && p.category !== product.category),
    ...all,
  ];
  const seen = new Set([key(product)]);
  const picked: Product[] = [];
  for (const p of candidates) {
    if (picked.length >= limit) break;
    if (seen.has(key(p))) continue;
    seen.add(key(p));
    picked.push(p);
  }
  return groupFormats(picked, all, families).map((g) => g.lead);
}

/** Count and average rating (one decimal, 0 when there is none) of a list of reviews. */
export function reviewStats(reviews: readonly Pick<Review, 'rating'>[]): {
  count: number;
  average: number;
} {
  const count = reviews.length;
  if (count === 0) return { count: 0, average: 0 };
  const sum = reviews.reduce((total, r) => total + r.rating, 0);
  return { count, average: Math.round((sum * 10) / count) / 10 };
}

/**
 * The reviews the site shows (spec 2.1): published ones about a product the
 * site shows, newest first (then by id, so the order is stable). None at all
 * when the owner turned reviews off (`settings.reviews.enabled`).
 */
export function publishedReviews(
  reviews: readonly Review[],
  productSlugs: ReadonlySet<string>,
  enabled = true,
): Review[] {
  if (!enabled) return [];
  return reviews
    .filter((r) => r.published && productSlugs.has(r.product))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** The reviews of one product, in the order given. */
export function reviewsFor(slug: string, reviews: readonly Review[]): Review[] {
  return reviews.filter((r) => r.product === slug);
}
