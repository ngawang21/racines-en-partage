// Small pure helpers shared by the storefront components (wave 2A).
import type { Locale } from '../consts';
import type { LocaleContent } from '../content/locale-schema';
import type { Settings, Stock } from '../content/schemas';
import { interpolate, pickLabel } from '../i18n/fallback';
import { formatPrice, toCents } from '../i18n/format';

export const STOCK_CLASS: Record<Stock, string> = {
  in_stock: 'badge-stock-in',
  low: 'badge-stock-low',
  out: 'badge-stock-out',
};

export function stockLabel(stock: Stock, t: LocaleContent): string {
  return { in_stock: t.product.stockIn, low: t.product.stockLow, out: t.product.stockOut }[stock];
}

/** "NE" to the regional-indicator flag emoji; empty for anything else. */
export function flagEmoji(code: string | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * "Livraison en Point Relais 4,90 €, offerte dès 49 €" from the relay
 * method of the settings, or null when that method is disabled.
 */
export function deliveryLine(settings: Settings, t: LocaleContent, locale: Locale): string | null {
  const relay = settings.shipping.find((s) => s.id === 'relay' && s.enabled);
  if (!relay) return null;
  const price = formatPrice(toCents(relay.price), locale);
  const threshold = settings.shop.freeShippingFrom;
  if (threshold == null) return interpolate(t.product.deliveryNoThreshold, { price });
  return interpolate(t.product.delivery, {
    price,
    threshold: formatPrice(toCents(threshold), locale).replace(/[,.]00(?=\D|$)/, ''),
  });
}

/** The relay method label in the locale, for the delivery line icon title. */
export function relayLabel(settings: Settings, locale: Locale): string {
  const relay = settings.shipping.find((s) => s.id === 'relay');
  return relay ? pickLabel(relay.label, locale) : '';
}

/** "{count} produit(s)" with the singular for 0 and 1 in French, 1 only in English. */
export function countLabel(count: number, t: LocaleContent, locale: Locale): string {
  const one = locale === 'fr' ? count <= 1 : count === 1;
  return interpolate(one ? t.shop.countOne : t.shop.countMany, { count });
}
