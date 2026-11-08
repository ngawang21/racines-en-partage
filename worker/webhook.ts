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

/**
 * Session metadata key set once both order e-mails are out (a customer
 * address refused for good counts as done).
 */
export const EMAILS_SENT_KEY = 'emails_sent';
/**
 * Session metadata key set when the owner e-mail is out but the customer
 * e-mail failed transiently: the retry then sends the customer e-mail only.
 */
export const OWNER_EMAILED_KEY = 'owner_emailed';

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
  env: Pick<AppEnv, 'ORDER_EMAIL_TO'> & Partial<Pick<AppEnv, 'SITE_URL'>>,
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
      template: 'order_owner',
    });
  }
  if (customerEmail) {
    const customer = renderCustomerEmail(summary, env.SITE_URL || undefined);
    messages.push({
      to: customerEmail,
      ...customer,
      ...(env.ORDER_EMAIL_TO ? { replyTo: env.ORDER_EMAIL_TO } : {}),
      idempotencyKey: `${eventId}:customer`,
      template: 'order_customer',
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
 * (`<event id>:<role>`) drops a duplicate of the same event for 24 hours.
 *
 * The owner e-mail goes first and the customer e-mail only once it is out.
 * Any owner failure, a permanent Resend refusal included (unverified domain,
 * bad sender), answers 500 so Stripe retries for up to three days: the shop
 * must never miss an order, and the customer cannot get a second confirmation
 * because of it, since none was sent yet. A customer address refused for good
 * counts as done; a transient customer failure marks `owner_emailed` and
 * retries the customer e-mail only.
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
  const owner = messages.find((m) => m.template === 'order_owner');
  const customer = messages.find((m) => m.template === 'order_customer');
  const ownerAlreadySent = session.metadata?.[OWNER_EMAILED_KEY] === 'true';
  const counts = { emailsSent: 0, emailsRefused: 0, emailsFailed: 0 };
  const sessionId = session.id;
  const logPaid = () =>
    logInfo('order.paid', {
      sessionId,
      eventId: event.id,
      total: session.amount_total ?? 0,
      currency: session.currency ?? 'eur',
      ...counts,
    });
  const logMailError = (recipient: 'owner' | 'customer', err: unknown) => {
    const permanent = isPermanentMailError(err);
    if (permanent) counts.emailsRefused++;
    else counts.emailsFailed++;
    logError(permanent ? 'order.email_refused' : 'order.email_failed', {
      sessionId,
      recipient,
      status: mailStatus(err),
      error: describeError(err),
    });
  };
  const retry = () => new ApiError(500, 'EMAIL_FAILED', 'Order e-mail could not be sent');

  let ownerSentNow = false;
  if (owner && !ownerAlreadySent) {
    try {
      await deps.mailer.send(owner);
      counts.emailsSent++;
      ownerSentNow = true;
    } catch (err) {
      // Permanent or not, the shop must hear of the order: Stripe retries the
      // event (up to three days) and the customer e-mail waits for the owner's.
      logMailError('owner', err);
      logPaid();
      throw retry();
    }
  }

  if (customer) {
    try {
      await deps.mailer.send(customer);
      counts.emailsSent++;
    } catch (err) {
      logMailError('customer', err);
      logPaid();
      if (!isPermanentMailError(err)) {
        // Stripe retries; the owner e-mail is not sent again.
        if (ownerSentNow) await markSession(deps.stripe, sessionId, OWNER_EMAILED_KEY);
        throw retry();
      }
      // Resending would be refused again (bad address): count it as done.
      await markSession(deps.stripe, sessionId, EMAILS_SENT_KEY);
      return;
    }
  }

  logPaid();
  await markSession(deps.stripe, sessionId, EMAILS_SENT_KEY);
}

/**
 * Sets one "done" key on the session (Stripe merges metadata: the delivery
 * keys stay). The e-mails are already out, so a failure cannot be undone: it
 * is logged as an error naming the duplicate it allows, to be checked by
 * hand (docs/launch-runbook.md, phase F).
 */
async function markSession(stripe: StripeLike, sessionId: string, key: string): Promise<void> {
  try {
    await stripe.checkout.sessions.update(sessionId, { metadata: { [key]: 'true' } });
  } catch (err) {
    logError('order.mark_failed', {
      sessionId,
      key,
      error: describeError(err),
      consequence:
        'session not marked: a redelivery of this event after 24 hours would send the e-mails again',
    });
  }
}
