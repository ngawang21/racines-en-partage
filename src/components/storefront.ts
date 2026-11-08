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

/**
 * The country of an origin line, for the product cards: "Allemagne,
 * Sonam’Tsampa" gives "Allemagne". The product page keeps the full line.
 */
export function originCountry(origin: string): string {
  return origin.split(',')[0]!.trim();
}

/**
 * The pouch in each product photo, measured on the 1067 x 1600 files: top and
 * bottom edges as fractions of the photo height. Keyed by file name without
 * the extension. A new photo without an entry keeps the default crop.
 */
export const POUCH_BOXES: Readonly<Record<string, { top: number; bottom: number }>> = {
  'baobab-100': { top: 0.214, bottom: 0.72 },
  'baobab-200': { top: 0.214, bottom: 0.72 },
  'cacao-grues-100': { top: 0.269, bottom: 0.767 },
  'cacao-poudre-100': { top: 0.269, bottom: 0.769 },
  'hibiscus-100': { top: 0.221, bottom: 0.794 },
  'moringa-100': { top: 0.248, bottom: 0.774 },
  'moringa-200': { top: 0.229, bottom: 0.772 },
  'orge-grillee-100': { top: 0.269, bottom: 0.77 },
  'psyllium-200': { top: 0.218, bottom: 0.78 },
  'souchet-poudre-100': { top: 0.266, bottom: 0.772 },
  'souchet-tubercules-200': { top: 0.235, bottom: 0.783 },
};

/** Where the pouch sits in a card frame: its top edge and its height, as fractions of the frame height. */
export const CARD_POUCH = { top: 0.18, height: 0.7 } as const;

/**
 * The crop of a product photo in a card frame, so every pouch has the same
 * scale and height (CARD_POUCH): `scale` is the photo width over the frame
 * width (1 or more, the photo always covers the frame) and `offset` the
 * photo's top edge below the frame's top, as a fraction of the frame width
 * (zero or less). Null for an unmeasured photo. The frame ratio is
 * width / height (4:5), the photo ratio likewise (2:3).
 */
export function pouchCrop(
  src: string,
  frameRatio = 4 / 5,
  photoRatio = 1067 / 1600,
): { scale: number; offset: number } | null {
  const name = src
    .split('/')
    .pop()!
    .replace(/\.[a-z]+$/i, '');
  const box = POUCH_BOXES[name];
  if (!box) return null;
  const frameH = 1 / frameRatio; // frame height in frame widths
  const photoH = 1 / photoRatio; // photo height in photo widths
  let scale = (CARD_POUCH.height * frameH) / ((box.bottom - box.top) * photoH);
  scale = Math.max(1, scale);
  let offset = CARD_POUCH.top * frameH - box.top * photoH * scale;
  // Never leave a gap: the photo starts at or above the frame top and ends at or below its bottom.
  offset = Math.min(0, Math.max(offset, frameH - photoH * scale));
  return { scale: Math.round(scale * 1000) / 1000, offset: Math.round(offset * 1000) / 1000 };
}

/**
 * The column ranges of a balanced product grid (shop and category pages), by
 * viewport: the preferred count and the counts it may switch to. Phones keep
 * two columns whatever the count (a third would make 105 px cards).
 */
export const GRID_RANGES = {
  /** 720 to 1079 px: four columns would make 150 px cards at 720. */
  md: { preferred: 3, min: 2, max: 3 },
  /** 1080 to 1279 px. */
  lg: { preferred: 3, min: 3, max: 4 },
  /** 1280 to 1599 px: four columns keep names and prices above the fold at 1440 x 900. */
  xl: { preferred: 4, min: 4, max: 5 },
  /** From 1600 px. */
  xxl: { preferred: 5, min: 4, max: 5 },
} as const;

export type GridRange = keyof typeof GRID_RANGES;

/**
 * The column count of a grid of `count` cards that never leaves one card
 * alone on the last row: the preferred count, else one more, else one fewer,
 * within the range. A grid that fits on one row keeps the preferred count (an
 * empty slot on the right is not an orphan), and the preferred count stays
 * when no allowed count avoids the lone card.
 */
export function balancedColumns(
  count: number,
  range: { preferred: number; min: number; max: number },
): number {
  const lone = (columns: number) => count > columns && count % columns === 1;
  const { preferred, min, max } = range;
  if (!lone(preferred)) return preferred;
  for (const columns of [preferred + 1, preferred - 1]) {
    if (columns >= min && columns <= max && !lone(columns)) return columns;
  }
  return preferred;
}

/**
 * The custom properties of a balanced grid of `count` cards, one per range
 * ("--cols-md: 2; --cols-lg: 4; ..."), read by the `.product-grid[data-balance]`
 * rules of global.css. The shop filter recomputes them for the visible cards.
 */
export function gridColumnsStyle(count: number): string {
  return (Object.keys(GRID_RANGES) as GridRange[])
    .map((range) => `--cols-${range}: ${balancedColumns(count, GRID_RANGES[range])}`)
    .join('; ');
}
