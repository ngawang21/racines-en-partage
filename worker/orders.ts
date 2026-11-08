// GET /api/orders/:sessionId and the order summary shared with the e-mails.
import type Stripe from 'stripe';
import { isLocale } from '../src/consts';
import { ApiError } from './errors';
import { maskEmail } from './log';
import type { Delivery, Locale, StripeLike } from './types';

export const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

/** The thanks page reads an order for 48 hours after the session was created. */
export const ORDER_VIEW_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** Above the 30 lines a checkout accepts: one page always holds every line. */
export const LINE_ITEMS_LIMIT = 100;

/** Retrieve-time expansions; line items come from listLineItems (no 10-item cap). */
export const SESSION_EXPAND = ['shipping_cost.shipping_rate'];

/**
 * The session with every line attached. `expand: ['line_items']` returns the
 * first 10 lines only; listLineItems takes up to 100 per page.
 */
export async function withLineItems(
  stripe: StripeLike,
  session: Stripe.Checkout.Session,
): Promise<Stripe.Checkout.Session> {
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: LINE_ITEMS_LIMIT,
    expand: ['data.price.product'],
  });
  return { ...session, line_items: lineItems };
}

/** True once the order is older than the thanks page may show. */
export function isOrderExpired(
  session: Pick<Stripe.Checkout.Session, 'created'>,
  now: Date,
): boolean {
  return now.getTime() - session.created * 1000 > ORDER_VIEW_MAX_AGE_MS;
}

export type OrderStatus = 'paid' | 'pending' | 'unpaid';

export interface OrderLine {
  name: string;
  quantity: number;
  /** Cents. */
  unitAmount: number;
  /** Cents, before discounts. */
  amount: number;
  sku: string | null;
}

export interface PostalAddress {
  line1: string | null;
  line2: string | null;
  postcode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface OrderSummary {
  sessionId: string;
  number: string;
  createdAt: Date;
  locale: Locale;
  status: OrderStatus;
  lines: OrderLine[];
  amounts: {
    subtotal: number;
    shipping: number;
    discount: number;
    total: number;
    currency: string;
  };
  delivery: Delivery | null;
  /** Shipping rate display name, in the checkout locale. */
  deliveryLabel: string | null;
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    billingAddress: PostalAddress | null;
    shipping: { name: string; address: PostalAddress } | null;
  };
  paymentIntentId: string | null;
}

/** "cs_test_a1B2...x9y8z7w6" to "X9Y8Z7W6". */
export function orderNumber(sessionId: string): string {
  return sessionId.slice(-8).toUpperCase();
}

/** Paid, or nothing to pay (a 100 % promotion code): the order is confirmed. */
export function isPaid(paymentStatus: Stripe.Checkout.Session.PaymentStatus): boolean {
  return paymentStatus === 'paid' || paymentStatus === 'no_payment_required';
}

export function orderStatus(
  session: Pick<Stripe.Checkout.Session, 'payment_status' | 'status'>,
): OrderStatus {
  if (isPaid(session.payment_status)) return 'paid';
  // Completed but unpaid: an asynchronous payment method is still processing.
  return session.status === 'complete' ? 'pending' : 'unpaid';
}

function toAddress(address: Stripe.Address | null | undefined): PostalAddress | null {
  if (!address) return null;
  return {
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    postcode: address.postal_code ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    country: address.country ?? null,
  };
}

/** The delivery the customer chose, rebuilt from the session metadata. */
export function deliveryFromMetadata(metadata: Stripe.Metadata | null): Delivery | null {
  const m = metadata ?? {};
  switch (m.delivery_method) {
    case 'home':
      return { method: 'home' };
    case 'pickup':
      return { method: 'pickup' };
    case 'relay':
      return {
        method: 'relay',
        relay: {
          id: m.relay_id ?? '',
          name: m.relay_name ?? '',
          address1: m.relay_address ?? '',
          postcode: m.relay_postcode ?? '',
          city: m.relay_city ?? '',
          country: m.relay_country ?? '',
        },
      };
    default:
      return null;
  }
}

/** The expanded product of a line, when the expansion came back (not deleted). */
function lineProduct(item: Stripe.LineItem): Stripe.Product | null {
  const product = item.price?.product;
  return product && typeof product === 'object' && !('deleted' in product && product.deleted)
    ? (product as Stripe.Product)
    : null;
}

/** The SKU: line item metadata first (set at checkout), then the product's. */
function lineSku(item: Stripe.LineItem): string | null {
  return item.metadata?.sku || lineProduct(item)?.metadata?.sku || null;
}

function toLine(item: Stripe.LineItem): OrderLine {
  const quantity = item.quantity ?? 1;
  const amount = item.amount_subtotal;
  return {
    name: item.description || lineProduct(item)?.name || '',
    quantity,
    unitAmount: item.price?.unit_amount ?? Math.round(amount / quantity),
    amount,
    sku: lineSku(item),
  };
}

/** A retrieved session (expanded `line_items`) to the summary the API and e-mails use. */
export function summariseSession(session: Stripe.Checkout.Session): OrderSummary {
  const metaLocale = session.metadata?.locale ?? session.locale ?? 'fr';
  const shippingRate = session.shipping_cost?.shipping_rate;
  const shippingDetails = session.collected_information?.shipping_details ?? null;
  const paymentIntent = session.payment_intent;
  return {
    sessionId: session.id,
    number: orderNumber(session.id),
    createdAt: new Date(session.created * 1000),
    locale: isLocale(metaLocale) ? metaLocale : 'fr',
    status: orderStatus(session),
    lines: (session.line_items?.data ?? []).map(toLine),
    amounts: {
      subtotal: session.amount_subtotal ?? 0,
      shipping: session.shipping_cost?.amount_total ?? 0,
      discount: session.total_details?.amount_discount ?? 0,
      total: session.amount_total ?? 0,
      currency: session.currency ?? 'eur',
    },
    delivery: deliveryFromMetadata(session.metadata),
    deliveryLabel:
      shippingRate && typeof shippingRate === 'object' ? shippingRate.display_name : null,
    customer: {
      name: session.customer_details?.name ?? null,
      email: session.customer_details?.email ?? null,
      phone: session.customer_details?.phone ?? null,
      billingAddress: toAddress(session.customer_details?.address),
      shipping: shippingDetails
        ? { name: shippingDetails.name, address: toAddress(shippingDetails.address)! }
        : null,
    },
    paymentIntentId:
      typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent?.id ?? null),
  };
}

/** The public view of an order for the thanks page (spec 6.3), e-mail masked. */
export function publicOrder(summary: OrderSummary) {
  return {
    status: summary.status,
    number: summary.number,
    lines: summary.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitAmount: l.unitAmount,
    })),
    amounts: {
      subtotal: summary.amounts.subtotal,
      shipping: summary.amounts.shipping,
      discount: summary.amounts.discount,
      total: summary.amounts.total,
      currency: summary.amounts.currency,
    },
    delivery: summary.delivery,
    email: maskEmail(summary.customer.email),
  };
}

export function assertSessionId(id: string): void {
  if (id.length > 255 || !SESSION_ID_PATTERN.test(id)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session id', {
      issues: [
        { path: 'sessionId', code: 'invalid_format', message: 'Expected cs_test_ or cs_live_' },
      ],
    });
  }
}

/** Stripe's "No such checkout.session" error. */
export function isResourceMissing(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; statusCode?: unknown };
  return e.code === 'resource_missing' || e.statusCode === 404;
}

/** "x9y8 z7w6" to "X9Y8Z7W6": spaces dropped, upper case, as `orderNumber` prints it. */
export function normaliseOrderNumber(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Stripe's list filter takes up to 100 sessions per e-mail address. */
export const LOOKUP_LIST_LIMIT = 100;

/**
 * The completed session of this shop whose number matches, among the 100 most
 * recent sessions of that e-mail address; null when none does. Stripe compares
 * the address exactly, so a miss is retried once in lower case.
 */
export async function findOrderByNumber(
  stripe: StripeLike,
  number: string,
  email: string,
): Promise<Stripe.Checkout.Session | null> {
  const wanted = normaliseOrderNumber(number);
  if (!wanted) return null;
  const addresses = [...new Set([email, email.toLowerCase()])];
  for (const address of addresses) {
    const list = await stripe.checkout.sessions.list({
      customer_details: { email: address },
      limit: LOOKUP_LIST_LIMIT,
    });
    const match = list.data.find(
      (s) =>
        s.status === 'complete' &&
        orderNumber(s.id) === wanted &&
        deliveryFromMetadata(s.metadata) !== null,
    );
    if (match) return match;
  }
  return null;
}
