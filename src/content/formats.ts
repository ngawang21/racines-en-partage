// Product formats (spec 2.5): moringa 100 g and 200 g are one product family.
// Pure and free of zod, so the client search (src/scripts/search.ts) groups
// its results with the same rules as the product grids; merge.ts re-exports
// everything here.
import type { Product } from './schemas';

/** What grouping needs: a slug and a weight (Product, or the client catalogue's ClientProduct). */
export interface FormatMember {
  slug: string;
  weightGrams: number;
}

/** What defining a family needs on top: the French name and the category. */
export interface FamilyMember extends FormatMember {
  name: string;
  category: string;
}

const lightestFirst = (a: FormatMember, b: FormatMember) =>
  a.weightGrams - b.weightGrams || a.slug.localeCompare(b.slug);

/**
 * The formats of a product (spec 2.5): the products of the same category with
 * the same French name (moringa 100 g and 200 g), the product itself included,
 * lightest first. `name` is shared through the French file, so pass products
 * merged in French, or in any locale whose names are translated together. A
 * list of one means there is no other format and no "Format" row.
 */
export function formatsOf<T extends FamilyMember>(product: T, all: readonly T[]): T[] {
  const key = (p: T) => p.name.trim().toLocaleLowerCase('fr');
  const family = all.filter(
    (p) => p.category === product.category && key(p) === key(product) && p.slug !== product.slug,
  );
  return [product, ...family].sort(lightestFirst);
}

/**
 * The family of every product: slug to the slug of the lightest format of
 * its family (formatsOf). Pass products merged in French, the language that
 * defines a family; the map then serves every locale.
 */
export function formatFamilies(all: readonly FamilyMember[]): Map<string, string> {
  return new Map(all.map((p) => [p.slug, formatsOf(p, all)[0]!.slug]));
}

/** One card of a grid: a product family shown through its lightest format. */
export interface ProductGroup<T extends FormatMember = Product> {
  /** The format the card shows and adds to the cart: the lightest one. */
  lead: T;
  /** Every format of the family, lightest first; one item when there is no other. */
  formats: T[];
}

/**
 * One group per product family (moringa 100 g and 200 g make one card), in
 * the order of the first member met in `products`. Each group lists the
 * family's formats taken from `all`, so a home selection holding only the
 * 100 g still offers the 200 g. A slug missing from `families` is its own
 * family. Without `families`, they are worked out from `all` (formatFamilies).
 */
export function groupFormats<T extends FamilyMember>(
  products: readonly T[],
  all?: readonly T[],
  families?: ReadonlyMap<string, string>,
): ProductGroup<T>[];
export function groupFormats<T extends FormatMember>(
  products: readonly T[],
  all: readonly T[],
  families: ReadonlyMap<string, string>,
): ProductGroup<T>[];
export function groupFormats<T extends FormatMember>(
  products: readonly T[],
  all: readonly T[] = products,
  families: ReadonlyMap<string, string> = formatFamilies(all as unknown as readonly FamilyMember[]),
): ProductGroup<T>[] {
  const key = (p: T) => families.get(p.slug) ?? p.slug;
  const groups: ProductGroup<T>[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const k = key(product);
    if (seen.has(k)) continue;
    seen.add(k);
    const members = all.filter((p) => key(p) === k);
    const formats = (members.some((p) => p.slug === product.slug) ? members : [product, ...members])
      .slice()
      .sort(lightestFirst);
    groups.push({ lead: formats[0]!, formats });
  }
  return groups;
}
