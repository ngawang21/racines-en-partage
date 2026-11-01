// POST /api/checkout: validate the cart against the catalogue, then create a
// Stripe Checkout Session exactly as spec 6.3 describes.
import type Stripe from 'stripe';
import { z } from 'zod';
import { LOCALES } from '../src/consts';
import type { CatalogProduct, CatalogShipping, WorkerCatalog } from './catalog';
import { ApiError } from './errors';
import { SHOP } from './shop';
import type { AppEnv, Delivery, Locale } from './types';

export const MAX_LINES = 30;
export const MAX_BODY_BYTES = 32 * 1024;
/** Stripe accepts 30 minutes to 24 hours. */
export const SESSION_TTL_SECONDS = 2 * 60 * 60;
/** Stripe metadata values are capped at 500 characters. */
const METADATA_MAX = 500;
/** `custom_text.*.message` is capped at 1200 characters. */
const CUSTOM_TEXT_MAX = 1200;

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Relay strings reach Stripe's page (name, city) and the owner e-mail: only
 * letters (accents included), digits, spaces and ' - . , / & ( ) pass.
 * Typographic apostrophes are folded to ' first.
 */
const RELAY_TEXT = /^[\p{L}\p{M}\d '\-.,/&()]*$/u;
const relayText = (max: number, min = 1) =>
  z
    .string()
    .transform((v) => v.replace(/[\u2018\u2019]/g, "'").trim())
    .pipe(z.string().min(min).max(max).regex(RELAY_TEXT, 'Unexpected character'));

export const RELAY_LIMITS = { name: 80, address1: 120, address2: 120, city: 60 } as const;

const relaySchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}-\d{6}$/),
    name: relayText(RELAY_LIMITS.name),
    address1: relayText(RELAY_LIMITS.address1),
    address2: relayText(RELAY_LIMITS.address2, 0).nullish(),
    postcode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{3,10}$/),
    city: relayText(RELAY_LIMITS.city),
    country: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/),
    // Sent by the widget for display; never used here.
    hoursHtml: z.string().max(20_000).nullish(),
  })
  .refine((relay) => relay.id.slice(0, 2) === relay.country, {
    path: ['id'],
    message: 'Relay id prefix must match the country',
  });

export const checkoutRequestSchema = z.object({
  locale: z.enum(LOCALES),
  items: z
    .array(
      z.object({
        sku: text(64),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(MAX_LINES)
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.sku)) {
          ctx.addIssue({ code: 'custom', path: [index, 'sku'], message: 'Duplicate SKU' });
        }
        seen.add(item.sku);
      });
    }),
  delivery: z.discriminatedUnion('method', [
    z.object({ method: z.literal('relay'), relay: relaySchema }),
    z.object({ method: z.literal('home') }),
    z.object({ method: z.literal('pickup') }),
  ]),
  acceptedTerms: z.literal(true),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

/** Zod issues without the submitted values. */
export function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.slice(0, 20).map((i) => ({
    path: i.path.map(String).join('.'),
    code: i.code,
    message: i.message,
  }));
}

export function parseCheckoutRequest(body: unknown): CheckoutRequest {
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid checkout request', {
      issues: toIssues(parsed.error),
    });
  }
  return parsed.data;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Same-origin guard: the Origin (or, without it, the Referer) must be the
 * shop's own host or the host that served this request. Any localhost origin
 * passes only when `SITE_URL` is itself a localhost URL (`wrangler dev` with
 * `.dev.vars`), never in production.
 */
export function isAllowedOrigin(request: Request, siteUrl: string): boolean {
  const source = request.headers.get('origin') ?? request.headers.get('referer');
  if (!source || source === 'null') return false;
  let from: URL;
  try {
    from = new URL(source);
  } catch {
    return false;
  }
  const site = new URL(siteUrl);
  if (from.origin === site.origin) return true;
  if (from.origin === new URL(request.url).origin) return true;
  return LOCAL_HOSTS.includes(site.hostname) && LOCAL_HOSTS.includes(from.hostname);
}

const truncate = (value: string, max: number) =>
  value.length <= max ? value : value.slice(0, max - 1) + '…';

/** "3 à 5 jours ouvrés", "3 to 5 working days", "2 jours" to a Stripe estimate. */
export function parseDeliveryEstimate(
  estimate: string,
):
  Stripe.Checkout.SessionCreateParams.ShippingOption.ShippingRateData.DeliveryEstimate | undefined {
  const match =
    /(\d{1,2})\s*(?:(?:à|to|-|–)\s*(\d{1,2})\s*)?(jours?\s+ouvrés?|working\s+days?|business\s+days?|jours?|days?)\b/iu.exec(
      estimate,
    );
  if (!match) return undefined;
  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  if (min < 1 || max < min) return undefined;
  const unit = /ouvr|working|business/i.test(match[3] ?? '') ? 'business_day' : 'day';
  return { minimum: { unit, value: min }, maximum: { unit, value: max } };
}

function relayAddress(relay: { address1: string; address2?: string | null }): string {
  return [relay.address1, relay.address2].filter((part) => part && part.length > 0).join(', ');
}

/**
 * The sentence shown above Stripe's pay button. For a relay point it carries
 * the method, the point's name and its city only: the full address stays in
 * the metadata, out of Stripe's page.
 */
export function submitMessage(delivery: Delivery, locale: Locale): string | undefined {
  if (delivery.method === 'relay') {
    const r = delivery.relay;
    const where = `${r.name}, ${r.city}`;
    return locale === 'fr'
      ? `Livraison en Point Relais Mondial Relay : ${where}.`
      : `Delivery to the Mondial Relay pickup point: ${where}.`;
  }
  if (delivery.method === 'pickup') {
    const a = SHOP.address;
    const where = `${a.street}, ${a.postcode} ${a.city}`;
    return locale === 'fr'
      ? `Retrait gratuit sur rendez-vous : ${where}. Nous vous contactons pour fixer un créneau.`
      : `Free pickup by appointment: ${where}. We will contact you to arrange a time.`;
  }
  return undefined;
}

type CheckedLine = { product: CatalogProduct; quantity: number };

/** Catalogue checks in contract order; returns the priced lines and the shipping method. */
export function checkAgainstCatalog(
  request: CheckoutRequest,
  catalog: WorkerCatalog,
): { lines: CheckedLine[]; method: CatalogShipping } {
  if (!catalog.shopOpen) throw new ApiError(503, 'SHOP_CLOSED', 'The shop is closed');

  const tooMany = request.items.flatMap((item, index) =>
    item.quantity > catalog.maxQuantityPerLine
      ? [
          {
            path: `items.${index}.quantity`,
            code: 'too_big',
            message: `Quantity must be at most ${catalog.maxQuantityPerLine}`,
          },
        ]
      : [],
  );
  if (tooMany.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid checkout request', { issues: tooMany });
  }

  const bySku = new Map(catalog.products.map((p) => [p.sku, p]));
  const unknown = request.items.filter((i) => !bySku.has(i.sku)).map((i) => i.sku);
  if (unknown.length > 0) {
    throw new ApiError(409, 'UNKNOWN_SKU', 'Unknown product', { skus: unknown });
  }
  const lines = request.items.map((i) => ({ product: bySku.get(i.sku)!, quantity: i.quantity }));
  const out = lines.filter((l) => l.product.stock === 'out').map((l) => l.product.sku);
  if (out.length > 0) {
    throw new ApiError(409, 'OUT_OF_STOCK', 'Some products are out of stock', { skus: out });
  }

  const methodId = request.delivery.method;
  const method = catalog.shipping.find((s) => s.id === methodId);
  const unavailable = (reason: string) =>
    new ApiError(409, 'SHIPPING_UNAVAILABLE', 'This delivery method is unavailable', {
      method: methodId,
      reason,
    });
  if (!method || !method.enabled) throw unavailable('disabled');
  if (method.countries.length === 0 && methodId !== 'pickup') throw unavailable('no_country');
  if (request.delivery.method === 'relay') {
    if (!method.countries.includes(request.delivery.relay.country)) throw unavailable('country');
  }
  return { lines, method };
}

export function subtotalOf(lines: CheckedLine[]): number {
  return lines.reduce((sum, l) => sum + l.product.unitAmount * l.quantity, 0);
}

/** The shipping amount: free from `freeShippingFrom` (inclusive). */
export function shippingAmount(
  method: CatalogShipping,
  subtotal: number,
  catalog: WorkerCatalog,
): number {
  const free = catalog.freeShippingFrom !== null && subtotal >= catalog.freeShippingFrom;
  return free ? 0 : method.amount;
}

function toDelivery(request: CheckoutRequest): Delivery {
  const d = request.delivery;
  if (d.method !== 'relay') return { method: d.method };
  const { hoursHtml: _hours, address2, ...relay } = d.relay;
  return { method: 'relay', relay: address2 ? { ...relay, address2 } : relay };
}

function sessionMetadata(request: CheckoutRequest, lines: CheckedLine[]): Record<string, string> {
  const delivery = toDelivery(request);
  const meta: Record<string, string> = {
    locale: request.locale,
    delivery_method: delivery.method,
  };
  if (delivery.method === 'relay') {
    const r = delivery.relay;
    meta.relay_id = r.id;
    meta.relay_name = r.name;
    meta.relay_address = relayAddress(r);
    meta.relay_postcode = r.postcode;
    meta.relay_city = r.city;
    meta.relay_country = r.country;
  }
  meta.skus = lines.map((l) => l.product.sku).join(',');
  return Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, truncate(v, METADATA_MAX)]));
}

const THANKS_PATH: Record<Locale, string> = { fr: '/merci/', en: '/en/thank-you/' };
const CART_PATH: Record<Locale, string> = { fr: '/panier/', en: '/en/cart/' };

/** The full `checkout.sessions.create` payload. Pure: unit tested field by field. */
export function buildSessionParams(
  request: CheckoutRequest,
  catalog: WorkerCatalog,
  env: Pick<AppEnv, 'SITE_URL'>,
  now: Date,
): Stripe.Checkout.SessionCreateParams {
  const { lines, method } = checkAgainstCatalog(request, catalog);
  const locale = request.locale;
  const site = env.SITE_URL.replace(/\/+$/, '');
  const subtotal = subtotalOf(lines);
  const estimate =
    parseDeliveryEstimate(method.estimate[locale]) ??
    parseDeliveryEstimate(method.estimate[locale === 'fr' ? 'en' : 'fr']);
  const message = submitMessage(toDelivery(request), locale);

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    locale,
    line_items: lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: catalog.currency,
        unit_amount: l.product.unitAmount,
        product_data: {
          name: l.product.name[locale],
          images: [l.product.image],
          metadata: { sku: l.product.sku },
        },
      },
    })),
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: {
            amount: shippingAmount(method, subtotal, catalog),
            currency: catalog.currency,
          },
          display_name: method.label[locale],
          ...(estimate ? { delivery_estimate: estimate } : {}),
        },
      },
    ],
    billing_address_collection: 'required',
    phone_number_collection: { enabled: true },
    customer_creation: 'if_required',
    allow_promotion_codes: true,
    metadata: sessionMetadata(request, lines),
    success_url: `${site}${THANKS_PATH[locale]}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}${CART_PATH[locale]}`,
    expires_at: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
  };
  if (method.id === 'home') {
    params.shipping_address_collection = {
      allowed_countries:
        method.countries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
    };
  }
  if (message) params.custom_text = { submit: { message: truncate(message, CUSTOM_TEXT_MAX) } };
  return params;
}
