// GET /api/orders/:sessionId and the order summary shared with the e-mails.
import type Stripe from 'stripe';
import { isLocale } from '../src/consts';
import { ApiError } from './errors';
import { maskEmail } from './log';
import type { Delivery, Locale } from './types';

export const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

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

function lineSku(item: Stripe.LineItem): string | null {
  const product = item.price?.product;
  if (product && typeof product === 'object' && 'metadata' in product) {
    return product.metadata.sku ?? null;
  }
  return null;
}

function toLine(item: Stripe.LineItem): OrderLine {
  const quantity = item.quantity ?? 1;
  const amount = item.amount_subtotal;
  return {
    name: item.description ?? '',
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
