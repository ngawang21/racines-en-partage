// Pure shaping of the two catalogues built from the content (spec 6.1, 6.2).
// No Astro import: unit tested, and safe to import types from client code.
import { LOCALES, type Locale } from '../consts';
import type { Product, Settings, ShippingMethod, Stock } from '../content/schemas';
import { pickLabel } from '../i18n/fallback';
import { formatWeight, toCents } from '../i18n/format';
import { routePath } from '../i18n/routing';

type Localised = Record<Locale, string>;

/** `dist/catalog.json`, read by the Worker through its ASSETS binding. */
export interface WorkerCatalog {
  generatedAt: string;
  currency: 'eur';
  vatMode: 'franchise' | 'included';
  shopOpen: boolean;
  maxQuantityPerLine: number;
  /** Cents, or null when free shipping is disabled. */
  freeShippingFrom: number | null;
  shipping: Array<{
    id: ShippingMethod;
    enabled: boolean;
    amount: number;
    countries: string[];
    label: Localised;
    estimate: Localised;
  }>;
  products: Array<{
    sku: string;
    slug: string;
    unitAmount: number;
    weightGrams: number;
    stock: Stock;
    name: Localised;
    /** Absolute URL of an 800 px WebP of the main image. */
    image: string;
  }>;
}

/** The locale-filtered catalogue embedded in storefront pages for the cart script. */
export interface ClientCatalog {
  locale: Locale;
  currency: 'eur';
  shopOpen: boolean;
  maxQuantityPerLine: number;
  freeShippingFrom: number | null;
  /** Enabled methods only, labels in the page locale. */
  shipping: Array<{
    id: ShippingMethod;
    amount: number;
    countries: string[];
    label: string;
    estimate: string;
  }>;
  /** Keyed by SKU. */
  products: Record<string, ClientProduct>;
}

export interface ClientProduct {
  sku: string;
  slug: string;
  /** Product page path in the locale. */
  url: string;
  /** Name with the weight, "Poudre de moringa 100 g". */
  name: string;
  weightGrams: number;
  unitAmount: number;
  stock: Stock;
  /** Root-relative URL of a small WebP thumbnail. */
  image: string;
}

/** "Poudre de moringa 100 g": the name a cart line, Stripe and the e-mails show. */
export function productLabel(name: string, weightGrams: number, locale: Locale): string {
  return `${name} ${formatWeight(weightGrams, locale).replaceAll(' ', ' ')}`;
}

function shippingRows(settings: Settings) {
  return settings.shipping.map((s) => ({
    id: s.id,
    enabled: s.enabled,
    amount: toCents(s.price),
    countries: [...s.countries],
    label: { fr: pickLabel(s.label, 'fr'), en: pickLabel(s.label, 'en') },
    estimate: { fr: pickLabel(s.estimate, 'fr'), en: pickLabel(s.estimate, 'en') },
  }));
}

function freeShippingFrom(settings: Settings): number | null {
  const v = settings.shop.freeShippingFrom;
  return v === null ? null : toCents(v);
}

function imageFor(imageUrlBySku: Record<string, string>, sku: string): string {
  const url = imageUrlBySku[sku];
  if (!url) throw new Error(`catalog: no image URL for ${sku}`);
  return url;
}

/**
 * The Worker catalogue. `products` holds the merged products per locale (the
 * French list is the reference for shared fields and order).
 */
export function buildCatalog(
  products: Record<Locale, Product[]>,
  settings: Settings,
  imageUrlBySku: Record<string, string>,
  now: Date,
): WorkerCatalog {
  const nameIn = (locale: Locale, p: Product) => {
    const local = products[locale].find((q) => q.sku === p.sku) ?? p;
    return productLabel(local.name, p.weightGrams, locale);
  };
  return {
    generatedAt: now.toISOString(),
    currency: settings.shop.currency,
    vatMode: settings.shop.vat.mode,
    shopOpen: settings.shop.open,
    maxQuantityPerLine: settings.shop.maxQuantityPerLine,
    freeShippingFrom: freeShippingFrom(settings),
    shipping: shippingRows(settings),
    products: products.fr.map((p) => ({
      sku: p.sku,
      slug: p.slug,
      unitAmount: toCents(p.price),
      weightGrams: p.weightGrams,
      stock: p.stock,
      name: Object.fromEntries(LOCALES.map((l) => [l, nameIn(l, p)])) as Localised,
      image: imageFor(imageUrlBySku, p.sku),
    })),
  };
}

/** The client catalogue of one locale (`products` already merged in that locale). */
export function buildClientCatalog(
  products: Product[],
  settings: Settings,
  locale: Locale,
  imageUrlBySku: Record<string, string>,
): ClientCatalog {
  return {
    locale,
    currency: settings.shop.currency,
    shopOpen: settings.shop.open,
    maxQuantityPerLine: settings.shop.maxQuantityPerLine,
    freeShippingFrom: freeShippingFrom(settings),
    shipping: shippingRows(settings)
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        amount: s.amount,
        countries: s.countries,
        label: s.label[locale],
        estimate: s.estimate[locale],
      })),
    products: Object.fromEntries(
      products.map((p) => [
        p.sku,
        {
          sku: p.sku,
          slug: p.slug,
          url: routePath('product', locale, p.slug),
          name: productLabel(p.name, p.weightGrams, locale),
          weightGrams: p.weightGrams,
          unitAmount: toCents(p.price),
          stock: p.stock,
          image: imageFor(imageUrlBySku, p.sku),
        },
      ]),
    ),
  };
}

/** JSON for a `<script type="application/json">` body: `<` escaped so no tag can close it. */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
