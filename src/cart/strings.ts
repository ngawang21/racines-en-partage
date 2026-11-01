// UI strings handed to the cart client in `<script type="application/json">`
// blocks. Pure: the server picks the namespaces, the client reads them back.
import { serializeForScript } from '../catalog/build';
import type { LocaleContent } from '../content/locale-schema';

/** Strings every page needs (drawer, badge, add-to-cart announcements). */
export interface CartStrings {
  cart: LocaleContent['cart'];
  product: Pick<LocaleContent['product'], 'stockOut' | 'stockLow'>;
  shop: Pick<LocaleContent['shop'], 'closedNotice'>;
}

/** Extra strings of the checkout and thanks pages. */
export interface PageStrings {
  checkout: LocaleContent['checkout'];
  thanks: LocaleContent['thanks'];
  errors: LocaleContent['errors'];
}

export type ClientStrings = CartStrings & Partial<PageStrings>;

export function cartStrings(t: LocaleContent): CartStrings {
  return {
    cart: t.cart,
    product: { stockOut: t.product.stockOut, stockLow: t.product.stockLow },
    shop: { closedNotice: t.shop.closedNotice },
  };
}

export function pageStrings(t: LocaleContent): PageStrings {
  return { checkout: t.checkout, thanks: t.thanks, errors: t.errors };
}

/**
 * serializeForScript, with the `{` of every `{token}` written as `{`.
 * JSON.parse restores it, and the built HTML holds no raw interpolation token
 * (a build test fails on a leaked `{name}` or `{amount}`).
 */
export function serializeStrings(value: unknown): string {
  return serializeForScript(value).replace(/\{(\w+)\}/g, '\\u007b$1}');
}
