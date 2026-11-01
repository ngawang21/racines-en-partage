// Client side of the Worker contract (spec 6.3). Pure helpers plus two thin
// fetch wrappers; the request and error shapes are unit tested.
import type { Locale } from '../consts';
import type { CartState, Delivery } from './store';

export interface CheckoutRequest {
  locale: Locale;
  items: Array<{ sku: string; quantity: number }>;
  delivery: Delivery;
  acceptedTerms: true;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_SKU'
  | 'OUT_OF_STOCK'
  | 'SHIPPING_UNAVAILABLE'
  | 'SHOP_CLOSED'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'UNKNOWN';

export interface ApiError {
  code: ApiErrorCode;
  status: number;
  skus: string[];
}

export interface OrderSummary {
  status: 'paid' | 'pending' | 'unpaid';
  number: string;
  lines: Array<{ name: string; quantity: number; unitAmount: number }>;
  amounts: { subtotal: number; shipping: number; total: number; currency: string };
  delivery: Delivery;
  email?: string;
}

const KNOWN_CODES: readonly ApiErrorCode[] = [
  'VALIDATION_ERROR',
  'UNKNOWN_SKU',
  'OUT_OF_STOCK',
  'SHIPPING_UNAVAILABLE',
  'SHOP_CLOSED',
  'PAYMENT_PROVIDER_ERROR',
  'NOT_FOUND',
];

/**
 * The POST /api/checkout body. Returns null when the cart cannot be ordered
 * as it stands (no line or no delivery). The relay point is sent without its
 * opening hours, which the Worker does not need.
 */
export function buildCheckoutRequest(cart: CartState, locale: Locale): CheckoutRequest | null {
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
    items: cart.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
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

/** Keys of the `errors` locale namespace for each code. */
export const ERROR_KEY: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'validation',
  UNKNOWN_SKU: 'unknownSku',
  OUT_OF_STOCK: 'outOfStock',
  SHIPPING_UNAVAILABLE: 'shippingUnavailable',
  SHOP_CLOSED: 'shopClosed',
  PAYMENT_PROVIDER_ERROR: 'payment',
  NOT_FOUND: 'generic',
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

/** Basic shape check of GET /api/orders/:id, so the page never renders half an object. */
export function parseOrder(data: unknown): OrderSummary | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Partial<OrderSummary>;
  if (!['paid', 'pending', 'unpaid'].includes(String(o.status))) return null;
  if (!Array.isArray(o.lines) || !o.amounts || typeof o.amounts.total !== 'number') return null;
  const ints = [o.amounts.subtotal, o.amounts.shipping, o.amounts.total];
  if (!ints.every((n) => Number.isInteger(n))) return null;
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
    amounts: o.amounts,
    delivery: o.delivery as Delivery,
    email: typeof o.email === 'string' ? o.email : undefined,
  };
}

/** Stripe Checkout session ids look like "cs_test_..." or "cs_live_...". */
export function isSessionId(value: string | null): value is string {
  return !!value && /^cs_(test|live)_[A-Za-z0-9]{1,250}$/.test(value);
}

export async function getOrder(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OrderSummary | null> {
  try {
    const response = await fetchImpl(`/api/orders/${encodeURIComponent(sessionId)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    return parseOrder(await response.json());
  } catch {
    return null;
  }
}
