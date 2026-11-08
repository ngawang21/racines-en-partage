// The delivery line of the cart page and the drawer, before a method is
// chosen: "Dès 4,90 € en Point Relais, offerte dès 49 €", or "Offerte" once
// the subtotal reaches the free-shipping threshold. Pure: the prices and the
// threshold come from the catalogue (the CMS settings), never from the copy.
import type { ClientCatalog } from '../catalog/build';
import { interpolate } from '../i18n/fallback';
import { shippingAmount } from './totals';

export type ShippingHint =
  { kind: 'free' } | { kind: 'from'; amount: number; freeFrom: number | null } | null;

/**
 * Point Relais, the default method of the checkout, priced for `subtotal`.
 * Null when the relay method is disabled: the line then keeps the neutral
 * "calculated at the next step".
 */
export function shippingHint(
  subtotal: number,
  catalog: Pick<ClientCatalog, 'shipping' | 'freeShippingFrom'>,
): ShippingHint {
  const relay = catalog.shipping.find((s) => s.id === 'relay');
  if (!relay) return null;
  const threshold = catalog.freeShippingFrom;
  if (shippingAmount(relay.amount, subtotal, threshold) === 0) return { kind: 'free' };
  return { kind: 'from', amount: relay.amount, freeFrom: threshold };
}

/** "49 €" rather than "49,00 €" for a round threshold, as on the product pages. */
export function wholePrice(formatted: string): string {
  return formatted.replace(/[,.]00(?=\D|$)/, '');
}

export interface ShippingHintStrings {
  shippingFrom: string;
  shippingFromFree: string;
  shippingOffered: string;
  shippingNextStep: string;
}

export function shippingHintText(
  hint: ShippingHint,
  t: ShippingHintStrings,
  price: (cents: number) => string,
): string {
  if (!hint) return t.shippingNextStep;
  if (hint.kind === 'free') return t.shippingOffered;
  const amount = price(hint.amount);
  if (hint.freeFrom === null) return interpolate(t.shippingFrom, { amount });
  return interpolate(t.shippingFromFree, { amount, threshold: wholePrice(price(hint.freeFrom)) });
}
