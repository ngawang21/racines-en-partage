// Client side of the Worker contract (spec 6.3). Pure helpers plus two thin
// fetch wrappers; the request and error shapes are unit tested.
import type { Locale } from '../consts';
import type { CartState, Delivery, StorageLike } from './store';

export interface CheckoutRequest {
  locale: Locale;
  /** `unitAmount`: the cents this page showed; the Worker refuses a stale price (PRICE_CHANGED). */
  items: Array<{ sku: string; quantity: number; unitAmount?: number }>;
  delivery: Delivery;
  acceptedTerms: true;
}

/** Every code of worker/errors.ts (ERROR_CODES; a Worker test keeps them in step). */
const KNOWN_CODES = [
  'VALIDATION_ERROR',
  'FORBIDDEN_ORIGIN',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'UNKNOWN_SKU',
  'OUT_OF_STOCK',
  'PRICE_CHANGED',
  'SHIPPING_UNAVAILABLE',
  'SHOP_CLOSED',
  'PAYMENT_PROVIDER_ERROR',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'INVALID_SIGNATURE',
  'CATALOG_UNAVAILABLE',
  'EMAIL_FAILED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  // Iteration 3: forms, reviews, order lookup.
  'CAPTCHA_FAILED',
  'ALREADY_REVIEWED',
  'INVALID_TOKEN',
  'ORDER_NOT_FOUND',
  'MAIL_FAILED',
  'FEATURE_DISABLED',
] as const;

/** A Worker code, `NETWORK` (no response) or `UNKNOWN` (anything else, an HTML 5xx page). */
export type ApiErrorCode = (typeof KNOWN_CODES)[number] | 'NETWORK' | 'UNKNOWN';

export interface ApiError {
  code: ApiErrorCode;
  status: number;
  skus: string[];
}

export interface OrderSummary {
  status: 'paid' | 'pending' | 'unpaid';
  number: string;
  lines: Array<{ name: string; quantity: number; unitAmount: number }>;
  amounts: {
    subtotal: number;
    shipping: number;
    /** Promotion code discount, cents; 0 without one. */
    discount: number;
    total: number;
    currency: string;
  };
  delivery: Delivery;
  email?: string;
}

/**
 * The POST /api/checkout body. Returns null when the cart cannot be ordered
 * as it stands (no line or no delivery). The relay point is sent without its
 * opening hours, which the Worker does not need. With the page catalogue,
 * each line carries the unit price shown, so a page older than the live
 * catalogue gets PRICE_CHANGED instead of a different price on Stripe.
 */
export function buildCheckoutRequest(
  cart: CartState,
  locale: Locale,
  products: Record<string, { unitAmount: number } | undefined> = {},
): CheckoutRequest | null {
  if (cart.lines.length === 0 || !cart.delivery) return null;
  const delivery: Delivery =
    cart.delivery.method === 'relay'
      ? {
          method: 'relay',
          relay: (({ hoursHtml: _hours, ...point }) => point)(cart.delivery.relay),
        }
      : { method: cart.delivery.method };
  return {
    locale,
    items: cart.lines.map((l) => {
      const shown = products[l.sku]?.unitAmount;
      return shown === undefined
        ? { sku: l.sku, quantity: l.quantity }
        : { sku: l.sku, quantity: l.quantity, unitAmount: shown };
    }),
    delivery,
    acceptedTerms: true,
  };
}

/** Reads `{ error: { code, details? } }`, tolerating any other body. */
export function parseApiError(status: number, body: unknown): ApiError {
  const error =
    body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { code?: unknown; details?: { skus?: unknown } } }).error
      : undefined;
  const raw = typeof error?.code === 'string' ? error.code : '';
  const code: ApiErrorCode = (KNOWN_CODES as readonly string[]).includes(raw)
    ? (raw as ApiErrorCode)
    : 'UNKNOWN';
  const skus = Array.isArray(error?.details?.skus)
    ? error.details.skus.filter((s): s is string => typeof s === 'string')
    : [];
  return { code, status, skus };
}

/**
 * Key of the `errors` locale namespace for each code. Codes a customer cannot
 * act on (a refused origin, a webhook code) share the generic message.
 */
export const ERROR_KEY: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'validation',
  FORBIDDEN_ORIGIN: 'generic',
  UNSUPPORTED_MEDIA_TYPE: 'generic',
  PAYLOAD_TOO_LARGE: 'validation',
  UNKNOWN_SKU: 'unknownSku',
  OUT_OF_STOCK: 'outOfStock',
  PRICE_CHANGED: 'priceChanged',
  SHIPPING_UNAVAILABLE: 'shippingUnavailable',
  SHOP_CLOSED: 'shopClosed',
  PAYMENT_PROVIDER_ERROR: 'payment',
  NOT_FOUND: 'generic',
  METHOD_NOT_ALLOWED: 'generic',
  INVALID_SIGNATURE: 'generic',
  CATALOG_UNAVAILABLE: 'unavailable',
  EMAIL_FAILED: 'generic',
  RATE_LIMITED: 'rateLimited',
  INTERNAL_ERROR: 'generic',
  CAPTCHA_FAILED: 'captchaFailed',
  ALREADY_REVIEWED: 'alreadyReviewed',
  INVALID_TOKEN: 'invalidToken',
  ORDER_NOT_FOUND: 'orderNotFound',
  MAIL_FAILED: 'mailFailed',
  FEATURE_DISABLED: 'featureDisabled',
  NETWORK: 'network',
  UNKNOWN: 'generic',
};

/** Accepts only a same-origin path or an https Stripe Checkout URL as a redirect target. */
export function safeRedirect(url: unknown, origin: string): string | null {
  if (typeof url !== 'string' || url === '') return null;
  try {
    const target = new URL(url, origin);
    if (target.origin === origin) return target.href;
    if (target.protocol === 'https:' && /(^|\.)stripe\.com$/.test(target.hostname))
      return target.href;
  } catch {
    return null;
  }
  return null;
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: ApiError };

export async function postCheckout(
  body: CheckoutRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutResult> {
  let response: Response;
  try {
    response = await fetchImpl('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    return { ok: false, error: { code: 'NETWORK', status: 0, skus: [] } };
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.ok && data && typeof (data as { url?: unknown }).url === 'string')
    return { ok: true, url: (data as { url: string }).url };
  return { ok: false, error: parseApiError(response.status, data) };
}

export type PostResult =
  { ok: true; status: number; data: unknown } | { ok: false; error: ApiError };

/** POST a JSON body to a same-origin API route; any non-2xx answer becomes an ApiError. */
export async function postJson(
  path: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<PostResult> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    return { ok: false, error: { code: 'NETWORK', status: 0, skus: [] } };
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, status: response.status, data };
  return { ok: false, error: parseApiError(response.status, data) };
}

/**
 * POST /api/orders/lookup (spec iteration 3, 2.6): `found` with the same
 * public order as GET /api/orders/:id, or the API error (ORDER_NOT_FOUND,
 * RATE_LIMITED, VALIDATION_ERROR, NETWORK...). A 2xx with a malformed body is
 * reported as UNKNOWN.
 */
export async function lookupOrder(
  number: string,
  email: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: 'found'; order: OrderSummary } | { status: 'error'; error: ApiError }> {
  const result = await postJson('/api/orders/lookup', { number, email }, fetchImpl);
  if (!result.ok) return { status: 'error', error: result.error };
  const order = parseOrder(result.data);
  return order
    ? { status: 'found', order }
    : { status: 'error', error: { code: 'UNKNOWN', status: result.status, skus: [] } };
}

/** Basic shape check of GET /api/orders/:id, so the page never renders half an object. */
export function parseOrder(data: unknown): OrderSummary | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Partial<OrderSummary>;
  if (!['paid', 'pending', 'unpaid'].includes(String(o.status))) return null;
  if (!Array.isArray(o.lines) || !o.amounts || typeof o.amounts.total !== 'number') return null;
  const ints = [o.amounts.subtotal, o.amounts.shipping, o.amounts.total];
  if (!ints.every((n) => Number.isInteger(n))) return null;
  // Older Worker versions sent no discount: treat it as none.
  const rawDiscount = (o.amounts as { discount?: unknown }).discount;
  const discount =
    Number.isInteger(rawDiscount) && (rawDiscount as number) > 0 ? (rawDiscount as number) : 0;
  const lines = o.lines.filter(
    (l) =>
      l &&
      typeof l.name === 'string' &&
      Number.isInteger(l.quantity) &&
      Number.isInteger(l.unitAmount),
  );
  return {
    status: o.status as OrderSummary['status'],
    number: typeof o.number === 'string' ? o.number : '',
    lines,
    amounts: {
      subtotal: o.amounts.subtotal,
      shipping: o.amounts.shipping,
      discount,
      total: o.amounts.total,
      currency: typeof o.amounts.currency === 'string' ? o.amounts.currency : 'eur',
    },
    delivery: o.delivery as Delivery,
    email: typeof o.email === 'string' ? o.email : undefined,
  };
}

/** Stripe Checkout session ids look like "cs_test_..." or "cs_live_...". */
export function isSessionId(value: string | null): value is string {
  return !!value && /^cs_(test|live)_[A-Za-z0-9]{1,250}$/.test(value);
}

/**
 * `found`; `missing` (404 or 400: no such order for this shop, or older than
 * 48 hours); `failed` (network, 429, 5xx, a malformed body): worth a retry.
 */
export type OrderLookup =
  { status: 'found'; order: OrderSummary } | { status: 'missing' } | { status: 'failed' };

export async function getOrder(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OrderLookup> {
  try {
    const response = await fetchImpl(`/api/orders/${encodeURIComponent(sessionId)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (response.status === 404 || response.status === 400) return { status: 'missing' };
    if (!response.ok) return { status: 'failed' };
    const order = parseOrder(await response.json());
    return order ? { status: 'found', order } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

/** localStorage key: the recent orders whose thanks page emptied the cart. */
export const CLEARED_ORDERS_KEY = 'rep.cart.cleared';
const CLEARED_ORDERS_KEPT = 20;

/**
 * True the first time an order's thanks page asks to empty the cart, false on
 * any later visit (a reload, the link in the history), so a new cart filled
 * since is never wiped. Without storage it always answers true.
 */
export function claimOrderClear(storage: StorageLike | null, sessionId: string): boolean {
  try {
    if (!storage) return true;
    let seen: unknown = [];
    try {
      seen = JSON.parse(storage.getItem(CLEARED_ORDERS_KEY) ?? '[]');
    } catch {
      // Corrupt value: start over.
    }
    const ids = Array.isArray(seen) ? seen.filter((v): v is string => typeof v === 'string') : [];
    if (ids.includes(sessionId)) return false;
    storage.setItem(
      CLEARED_ORDERS_KEY,
      JSON.stringify([...ids, sessionId].slice(-CLEARED_ORDERS_KEPT)),
    );
  } catch {
    // Storage refused: clear, as before.
  }
  return true;
}
