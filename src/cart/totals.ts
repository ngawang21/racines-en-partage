// Cart totals (spec 6.1): pure, integer cents. Display only; the Worker
// re-prices every order from dist/catalog.json.
import type { ClientCatalog, ClientProduct } from '../catalog/build';
import type { CartState, ShippingMethodId } from './store';

export interface TotalsLine {
  sku: string;
  quantity: number;
  product: ClientProduct;
  /** unitAmount x quantity, cents. */
  lineTotal: number;
  outOfStock: boolean;
}

export interface Totals {
  /** Lines whose SKU is in the catalogue, in cart order. */
  lines: TotalsLine[];
  /** Units over the known lines. */
  itemCount: number;
  subtotal: number;
  /** The selected method's method id, when one is selected and enabled. */
  shippingMethod: ShippingMethodId | null;
  /** Cents for the selected method, 0 once free shipping applies; null without a usable method. */
  shipping: number | null;
  /** subtotal + shipping (shipping counted as 0 while unknown). */
  total: number;
  /** Cents still missing for free shipping, 0 once reached, null when free shipping is disabled. */
  freeShippingGap: number | null;
  /** 0..1 progress towards free shipping, null when disabled. */
  freeShippingProgress: number | null;
  freeShipping: boolean;
  /** SKUs of the cart that the catalogue does not know (removed products). */
  unknownSkus: string[];
  /** SKUs of the cart whose stock is `out`. */
  outOfStockSkus: string[];
  /** The selected method is no longer enabled. */
  shippingUnavailable: boolean;
  /** Nothing blocks a checkout request on the client side. */
  orderable: boolean;
}

type Catalog = Pick<ClientCatalog, 'products' | 'shipping' | 'freeShippingFrom' | 'shopOpen'>;

/** The price of a method for a given subtotal: free at or above the threshold. */
export function shippingAmount(
  methodAmount: number,
  subtotal: number,
  freeShippingFrom: number | null,
): number {
  return freeShippingFrom !== null && subtotal >= freeShippingFrom ? 0 : methodAmount;
}

export function computeTotals(cart: CartState, catalog: Catalog): Totals {
  const lines: TotalsLine[] = [];
  const unknownSkus: string[] = [];
  const outOfStockSkus: string[] = [];
  for (const line of cart.lines) {
    const product = catalog.products[line.sku];
    if (!product) {
      unknownSkus.push(line.sku);
      continue;
    }
    const outOfStock = product.stock === 'out';
    if (outOfStock) outOfStockSkus.push(line.sku);
    lines.push({
      sku: line.sku,
      quantity: line.quantity,
      product,
      lineTotal: product.unitAmount * line.quantity,
      outOfStock,
    });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);

  const threshold = catalog.freeShippingFrom;
  const freeShipping = threshold !== null && subtotal >= threshold;
  const freeShippingGap = threshold === null ? null : Math.max(0, threshold - subtotal);
  const freeShippingProgress =
    threshold === null ? null : threshold <= 0 ? 1 : Math.min(1, subtotal / threshold);

  const selected = cart.delivery?.method ?? null;
  const method = selected ? catalog.shipping.find((s) => s.id === selected) : undefined;
  const shippingUnavailable = selected !== null && !method;
  const shipping = method ? shippingAmount(method.amount, subtotal, threshold) : null;

  return {
    lines,
    itemCount,
    subtotal,
    shippingMethod: method ? method.id : null,
    shipping,
    total: subtotal + (shipping ?? 0),
    freeShippingGap,
    freeShippingProgress,
    freeShipping,
    unknownSkus,
    outOfStockSkus,
    shippingUnavailable,
    orderable:
      catalog.shopOpen &&
      lines.length > 0 &&
      unknownSkus.length === 0 &&
      outOfStockSkus.length === 0 &&
      !shippingUnavailable,
  };
}
