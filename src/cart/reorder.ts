// "Commander à nouveau" (spec iteration 3, 8.6): pure picking of the lines of
// a past order that can go back into the cart. A line comes back when its SKU
// is still in the client catalogue (published) and not out of stock, with its
// quantity capped at the per-line maximum; repeated SKUs are merged. The
// others are reported by name so the page can say they are gone.
import type { ClientCatalog } from '../catalog/build';

export interface ReorderLine {
  sku?: unknown;
  name: string;
  quantity: number;
}

export interface ReorderPick {
  /** Lines to add, in order of first appearance. */
  lines: Array<{ sku: string; quantity: number }>;
  /** Names of the lines that cannot come back (unknown, hidden or out of stock), deduplicated. */
  unavailable: string[];
}

export function linesToCart(
  order: { lines: readonly ReorderLine[] },
  catalog: Pick<ClientCatalog, 'products'>,
  max: number,
): ReorderPick {
  const quantities = new Map<string, number>();
  const unavailable: string[] = [];
  for (const line of order.lines) {
    const quantity = Number.isInteger(line.quantity) ? line.quantity : 0;
    if (quantity <= 0) continue;
    const sku = typeof line.sku === 'string' ? line.sku : '';
    const product = sku && Object.hasOwn(catalog.products, sku) ? catalog.products[sku] : undefined;
    if (!product || product.stock === 'out') {
      const name = product?.name ?? line.name;
      if (name && !unavailable.includes(name)) unavailable.push(name);
      continue;
    }
    quantities.set(sku, (quantities.get(sku) ?? 0) + quantity);
  }
  const cap = Math.max(1, Math.floor(max));
  return {
    lines: [...quantities].map(([sku, quantity]) => ({ sku, quantity: Math.min(quantity, cap) })),
    unavailable,
  };
}
