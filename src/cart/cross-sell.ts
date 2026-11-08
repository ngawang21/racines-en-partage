// Cart cross-sell (spec iteration 3, 2.9): pure picking of up to `max`
// products to suggest under the cart lines. Candidates come from the
// `related` lists of the lines, in cart order, then from the featured
// products in catalogue order; a candidate must be in the catalogue (so
// published), not out of stock and not already in the cart.
//
// Premium pass (review 11): a suggestion is never another format of a product
// already in the cart (moringa 200 g next to moringa 100 g), the list holds
// one format per product, and products of a category the cart does not hold
// yet come first, so the drawer proposes a complement rather than a sibling.
import type { ClientCatalog, ClientProduct } from '../catalog/build';

/**
 * The product a SKU is a format of: its category and its slug without the
 * trailing weight ("poudre-de-moringa-100g" and "-200g" are one product), the
 * rule `formatsOf` applies to the French names at build time.
 */
export function formatFamily(product: Pick<ClientProduct, 'slug' | 'category'>): string {
  return `${product.category}/${product.slug.replace(/-\d+(?:[.,]\d+)?k?g$/i, '')}`;
}

export function pickCrossSell(
  lines: ReadonlyArray<{ sku: string }>,
  catalog: Pick<ClientCatalog, 'products'>,
  max = 2,
): ClientProduct[] {
  if (max <= 0 || lines.length === 0) return [];
  const products = catalog.products;
  const get = (sku: string) => (Object.hasOwn(products, sku) ? products[sku] : undefined);
  const inCart = new Set(lines.map((l) => l.sku));
  const cartProducts = lines.map((l) => get(l.sku)).filter((p) => p !== undefined);
  const families = new Set(cartProducts.map(formatFamily));
  const categories = new Set(cartProducts.map((p) => p.category));

  const candidates: ClientProduct[] = [];
  const consider = (sku: string) => {
    const product = get(sku);
    if (!product || inCart.has(sku) || product.stock === 'out') return;
    const family = formatFamily(product);
    // In the cart already, or suggested already in another format.
    if (families.has(family)) return;
    families.add(family);
    candidates.push(product);
  };

  for (const line of lines) for (const sku of get(line.sku)?.related ?? []) consider(sku);
  for (const product of Object.values(products)) if (product.featured) consider(product.sku);

  const complements = candidates.filter((p) => !categories.has(p.category));
  const siblings = candidates.filter((p) => categories.has(p.category));
  return [...complements, ...siblings].slice(0, max);
}
