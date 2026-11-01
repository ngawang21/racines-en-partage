// POST /api/webhooks/stripe: verify, then send the owner and customer e-mails
// for a paid Checkout Session (spec 6.3).
import type Stripe from 'stripe';
import { renderCustomerEmail, renderOwnerEmail } from './email/templates';
import { ApiError } from './errors';
import { describeError, logError, logInfo } from './log';
import { isPaid, summariseSession } from './orders';
import type { AppEnv, MailMessage, Mailer, StripeLike } from './types';

export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const MAX_WEBHOOK_BYTES = 512 * 1024;

export const WEBHOOK_EXPAND = [
  'line_items',
  'line_items.data.price.product',
  'shipping_cost.shipping_rate',
];

export async function verifyEvent(
  stripe: StripeLike,
  payload: string,
  signature: string | undefined,
  secret: string,
): Promise<Stripe.Event> {
  if (!signature || !secret) {
    throw new ApiError(400, 'INVALID_SIGNATURE', 'Missing Stripe signature');
  }
  try {
    return await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
      SIGNATURE_TOLERANCE_SECONDS,
    );
  } catch {
    throw new ApiError(400, 'INVALID_SIGNATURE', 'Invalid Stripe signature');
  }
}

/** The two e-mails of a paid order, keyed for Resend idempotency. */
export function orderEmails(
  session: Stripe.Checkout.Session,
  eventId: string,
  env: Pick<AppEnv, 'ORDER_EMAIL_TO'>,
): MailMessage[] {
  const summary = summariseSession(session);
  const messages: MailMessage[] = [];
  const customerEmail = summary.customer.email?.trim() || null;
  if (env.ORDER_EMAIL_TO) {
    const owner = renderOwnerEmail(summary);
    messages.push({
      to: env.ORDER_EMAIL_TO,
      ...owner,
      ...(customerEmail ? { replyTo: customerEmail } : {}),
      idempotencyKey: `${eventId}:${env.ORDER_EMAIL_TO}`,
    });
  }
  if (customerEmail) {
    const customer = renderCustomerEmail(summary);
    messages.push({
      to: customerEmail,
      ...customer,
      ...(env.ORDER_EMAIL_TO ? { replyTo: env.ORDER_EMAIL_TO } : {}),
      idempotencyKey: `${eventId}:${customerEmail}`,
    });
  }
  return messages;
}

/**
 * Handles one verified event. Resolves when there is nothing (more) to do;
 * throws an ApiError when Stripe should retry (5xx).
 */
export async function handleEvent(
  event: Stripe.Event,
  deps: { stripe: StripeLike; mailer: Mailer; env: AppEnv },
): Promise<void> {
  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded'
  ) {
    return;
  }
  const brief = event.data.object;
  if (!isPaid(brief.payment_status)) {
    // An asynchronous payment is still processing: async_payment_succeeded follows.
    logInfo('order.awaiting_payment', { sessionId: brief.id, eventId: event.id });
    return;
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await deps.stripe.checkout.sessions.retrieve(brief.id, { expand: WEBHOOK_EXPAND });
  } catch (err) {
    logError('order.retrieve_failed', { sessionId: brief.id, error: describeError(err) });
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not retrieve the session');
  }

  if (!deps.env.ORDER_EMAIL_TO) logError('config.missing', { name: 'ORDER_EMAIL_TO' });
  const messages = orderEmails(session, event.id, deps.env);
  const results = await Promise.allSettled(messages.map((m) => deps.mailer.send(m)));
  const failed = results.flatMap((r, i) =>
    r.status === 'rejected' ? [{ index: i, reason: describeError(r.reason) }] : [],
  );

  logInfo('order.paid', {
    sessionId: session.id,
    eventId: event.id,
    total: session.amount_total ?? 0,
    currency: session.currency ?? 'eur',
    emailsSent: messages.length - failed.length,
    emailsFailed: failed.length,
  });

  if (failed.length > 0) {
    for (const f of failed) {
      logError('order.email_failed', {
        sessionId: session.id,
        recipient: f.index === 0 && deps.env.ORDER_EMAIL_TO ? 'owner' : 'customer',
        error: f.reason,
      });
    }
    // Stripe retries the event; Resend drops the e-mails already sent (same key).
    throw new ApiError(500, 'EMAIL_FAILED', 'Order e-mail could not be sent');
  }
}
