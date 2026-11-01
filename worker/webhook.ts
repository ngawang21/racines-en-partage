// POST /api/webhooks/stripe: verify, then send the owner and customer e-mails
// for a paid Checkout Session (spec 6.3).
import type Stripe from 'stripe';
import { renderCustomerEmail, renderOwnerEmail } from './email/templates';
import { ApiError } from './errors';
import { describeError, logError, logInfo } from './log';
import { SESSION_EXPAND, isPaid, summariseSession, withLineItems } from './orders';
import type { AppEnv, MailMessage, Mailer, StripeLike } from './types';

export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const MAX_WEBHOOK_BYTES = 512 * 1024;

/** Session metadata key set once both order e-mails are out (or refused for good). */
export const EMAILS_SENT_KEY = 'emails_sent';

/**
 * A refusal Stripe should not retry: Resend 4xx other than 409 (idempotency
 * conflict, retryable) and 429 (rate limit). 5xx, network errors and errors
 * without a status are transient.
 */
export function isPermanentMailError(err: unknown): boolean {
  const status =
    typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
  return (
    typeof status === 'number' && status >= 400 && status < 500 && status !== 409 && status !== 429
  );
}

function mailStatus(err: unknown): number | null {
  const status =
    typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
  return typeof status === 'number' ? status : null;
}

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

/**
 * The two e-mails of a paid order, keyed for Resend idempotency by event and
 * role (`<event id>:owner`, `<event id>:customer`). Keying by address would
 * give both e-mails one key when the owner orders with her own address, and
 * Resend would refuse the second one (409) on every retry.
 */
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
      idempotencyKey: `${eventId}:owner`,
    });
  }
  if (customerEmail) {
    const customer = renderCustomerEmail(summary);
    messages.push({
      to: customerEmail,
      ...customer,
      ...(env.ORDER_EMAIL_TO ? { replyTo: env.ORDER_EMAIL_TO } : {}),
      idempotencyKey: `${eventId}:customer`,
    });
  }
  return messages;
}

/**
 * Handles one verified event. Resolves when there is nothing (more) to do;
 * throws an ApiError when Stripe should retry (5xx).
 *
 * Idempotency without storage: once both e-mails are out, the session gets
 * `metadata.emails_sent = 'true'`; a redelivered or second event finds it and
 * sends nothing. Between a send and that mark, Resend's `Idempotency-Key`
 * (`<event id>:<role>`) drops a duplicate of the same event.
 */
export async function handleEvent(
  event: Stripe.Event,
  deps: { stripe: StripeLike; mailer: Mailer; env: AppEnv },
): Promise<void> {
  if (event.type === 'checkout.session.async_payment_failed') {
    // A delayed payment (bank debit) failed: no order e-mail was sent while it
    // was pending, so there is nothing to undo. Logged for the dashboard.
    const failed = event.data.object;
    if (failed.metadata?.delivery_method) {
      logError('order.payment_failed', { sessionId: failed.id, eventId: event.id });
    }
    return;
  }
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
    session = await deps.stripe.checkout.sessions.retrieve(brief.id, { expand: SESSION_EXPAND });
  } catch (err) {
    logError('order.retrieve_failed', { sessionId: brief.id, error: describeError(err) });
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not retrieve the session');
  }

  if (!session.metadata?.delivery_method) {
    // A Checkout Session of the same Stripe account not created by this shop.
    logInfo('order.not_ours', { sessionId: session.id, eventId: event.id });
    return;
  }
  if (session.metadata[EMAILS_SENT_KEY] === 'true') {
    logInfo('order.already_notified', { sessionId: session.id, eventId: event.id });
    return;
  }

  try {
    session = await withLineItems(deps.stripe, session);
  } catch (err) {
    logError('order.retrieve_failed', { sessionId: session.id, error: describeError(err) });
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not list the order lines');
  }

  if (!deps.env.ORDER_EMAIL_TO) logError('config.missing', { name: 'ORDER_EMAIL_TO' });
  const messages = orderEmails(session, event.id, deps.env);
  const results = await Promise.allSettled(messages.map((m) => deps.mailer.send(m)));
  const recipient = (i: number) => (i === 0 && deps.env.ORDER_EMAIL_TO ? 'owner' : 'customer');
  const rejected = results.flatMap((r, i) =>
    r.status === 'rejected' ? [{ i, err: r.reason }] : [],
  );
  const refused = rejected.filter((r) => isPermanentMailError(r.err));
  const failed = rejected.filter((r) => !isPermanentMailError(r.err));

  logInfo('order.paid', {
    sessionId: session.id,
    eventId: event.id,
    total: session.amount_total ?? 0,
    currency: session.currency ?? 'eur',
    emailsSent: messages.length - rejected.length,
    emailsRefused: refused.length,
    emailsFailed: failed.length,
  });

  for (const r of refused) {
    // Resending would be refused again (bad address, unverified domain...): count it as done.
    logError('order.email_refused', {
      sessionId: session.id,
      recipient: recipient(r.i),
      status: mailStatus(r.err),
      error: describeError(r.err),
    });
  }

  if (failed.length > 0) {
    for (const f of failed) {
      logError('order.email_failed', {
        sessionId: session.id,
        recipient: recipient(f.i),
        status: mailStatus(f.err),
        error: describeError(f.err),
      });
    }
    // Stripe retries the event; Resend drops the e-mails already sent (same key).
    throw new ApiError(500, 'EMAIL_FAILED', 'Order e-mail could not be sent');
  }

  try {
    // Stripe merges metadata: the delivery keys stay.
    await deps.stripe.checkout.sessions.update(session.id, {
      metadata: { [EMAILS_SENT_KEY]: 'true' },
    });
  } catch (err) {
    // The e-mails are out; a retry of this event would be deduplicated by Resend.
    logError('order.mark_failed', { sessionId: session.id, error: describeError(err) });
  }
}
