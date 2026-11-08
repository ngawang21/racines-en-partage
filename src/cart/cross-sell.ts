// Cart cross-sell (spec iteration 3, 2.9): pure picking of up to `max`
// products to suggest under the cart lines. Candidates come from the
// `related` lists of the lines, in cart order, then from the featured
// products in catalogue order; a candidate must be in the catalogue (so
// published), not out of stock and not already in the cart.
import type { ClientCatalog, ClientProduct } from '../catalog/build';

export function pickCrossSell(
  lines: ReadonlyArray<{ sku: string }>,
  catalog: Pick<ClientCatalog, 'products'>,
  max = 2,
): ClientProduct[] {
  if (max <= 0 || lines.length === 0) return [];
  const products = catalog.products;
  const inCart = new Set(lines.map((l) => l.sku));
  const picked: ClientProduct[] = [];
  const seen = new Set<string>();

  const consider = (sku: string): boolean => {
    if (seen.has(sku) || inCart.has(sku)) return false;
    seen.add(sku);
    const product = Object.hasOwn(products, sku) ? products[sku] : undefined;
    if (!product || product.stock === 'out') return false;
    picked.push(product);
    return picked.length >= max;
  };

  for (const line of lines) {
    const related = products[line.sku]?.related ?? [];
    for (const sku of related) if (consider(sku)) return picked;
  }
  for (const product of Object.values(products))
    if (product.featured && consider(product.sku)) return picked;
  return picked;
}
