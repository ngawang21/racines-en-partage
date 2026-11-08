import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailerError, NullMailer } from '../../worker/email/resend';
import { isPermanentMailError } from '../../worker/webhook';
import { createStripeClient } from '../../worker/stripe';
import type { StripeLike } from '../../worker/types';
import {
  ENV,
  SESSION_ID,
  fakeStripe,
  fr,
  makeApp,
  sessionFixture,
  type ErrorJson,
} from './fixtures';

const SECRET = ENV.STRIPE_WEBHOOK_SECRET;
const signer = new Stripe('sk_test_signer_only');

function eventPayload(
  type = 'checkout.session.completed',
  object: Record<string, unknown> = {
    id: SESSION_ID,
    object: 'checkout.session',
    payment_status: 'paid',
  },
  id = 'evt_test_1',
) {
  return JSON.stringify({ id, object: 'event', type, data: { object } });
}

async function signed(payload: string, secret = SECRET) {
  return signer.webhooks.generateTestHeaderStringAsync({ payload, secret });
}

/** Fake Checkout API, real signature verification (worker/stripe.ts, SubtleCrypto). */
function stripeWithRealWebhooks() {
  const fake = fakeStripe();
  const stripe: StripeLike = {
    checkout: fake.stripe.checkout,
    webhooks: createStripeClient('sk_test_unused').webhooks,
  };
  return { ...fake, stripe };
}

async function post(app: ReturnType<typeof makeApp>['app'], payload: string, signature?: string) {
  return app.request('/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'Stripe-Signature': signature } : {}),
    },
    body: payload,
  });
}

let logs: string[];
let errors: string[];
beforeEach(() => {
  logs = [];
  errors = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(line));
  vi.spyOn(console, 'error').mockImplementation((line: string) => void errors.push(line));
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/webhooks/stripe', () => {
  it('400 INVALID_SIGNATURE for a bad signature', async () => {
    const fake = stripeWithRealWebhooks();
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload, 'whsec_other_secret'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorJson).error.code).toBe('INVALID_SIGNATURE');
    expect(fake.retrieve).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('400 INVALID_SIGNATURE without the Stripe-Signature header', async () => {
    const { app } = makeApp({ stripe: stripeWithRealWebhooks().stripe });
    const res = await post(app, eventPayload());
    expect(res.status).toBe(400);
  });

  it('400 INVALID_SIGNATURE when the payload was altered after signing', async () => {
    const { app } = makeApp({ stripe: stripeWithRealWebhooks().stripe });
    const payload = eventPayload();
    const header = await signed(payload);
    const res = await post(app, payload.replace('"paid"', '"unpaid"'), header);
    expect(res.status).toBe(400);
  });

  it('paid session: retrieves it expanded and sends two e-mails with idempotency keys', async () => {
    const fake = stripeWithRealWebhooks();
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(fake.retrieve).toHaveBeenCalledWith(SESSION_ID, {
      expand: ['shipping_cost.shipping_rate'],
    });
    expect(fake.listLineItems).toHaveBeenCalledWith(SESSION_ID, {
      limit: 100,
      expand: ['data.price.product'],
    });
    expect(mail.sent).toHaveLength(2);
    const [owner, customer] = mail.sent;
    expect(owner).toMatchObject({
      to: 'racinesenpartage@gmail.com',
      replyTo: 'awa.diallo@example.com',
      idempotencyKey: 'evt_test_1:owner',
      subject: fr('Nouvelle commande E5F6G7H8 : 30,60 €'),
    });
    expect(customer).toMatchObject({
      to: 'awa.diallo@example.com',
      replyTo: 'racinesenpartage@gmail.com',
      idempotencyKey: 'evt_test_1:customer',
      subject: fr('Votre commande n° E5F6G7H8 est confirmée'),
    });
    // Both e-mails out: the session is marked, metadata merged by Stripe.
    expect(fake.update).toHaveBeenCalledExactlyOnceWith(SESSION_ID, {
      metadata: { emails_sent: 'true' },
    });
  });

  it('logs one structured line per order with no personal data', async () => {
    const { app } = makeApp({ stripe: stripeWithRealWebhooks().stripe });
    const payload = eventPayload();
    await post(app, payload, await signed(payload));
    const orderLines = logs.filter((l) => l.includes('order.paid'));
    expect(orderLines).toHaveLength(1);
    expect(JSON.parse(orderLines[0]!)).toEqual({
      level: 'info',
      msg: 'order.paid',
      sessionId: SESSION_ID,
      eventId: 'evt_test_1',
      total: 3060,
      currency: 'eur',
      emailsSent: 2,
      emailsRefused: 0,
      emailsFailed: 0,
    });
    const all = [...logs, ...errors].join('\n');
    expect(all).not.toContain('awa.diallo');
    expect(all).not.toContain('Diallo');
    expect(all).not.toContain('+336');
  });

  it('async_payment_succeeded is handled like a paid completion', async () => {
    const { app, mail } = makeApp({ stripe: stripeWithRealWebhooks().stripe });
    const payload = eventPayload(
      'checkout.session.async_payment_succeeded',
      undefined,
      'evt_async',
    );
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(mail.sent.map((m) => m.idempotencyKey)).toEqual([
      'evt_async:owner',
      'evt_async:customer',
    ]);
  });

  it('the owner ordering with her own address: two distinct idempotency keys', async () => {
    // One key for both would make Resend refuse the second e-mail (409, a
    // different payload under the same key) on every Stripe retry.
    const fake = stripeWithRealWebhooks();
    fake.retrieve.mockResolvedValueOnce({
      ...sessionFixture({
        customer_details: {
          ...sessionFixture().customer_details,
          email: 'racinesenpartage@gmail.com',
        },
      }),
      line_items: undefined,
    } as never);
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    const keys = mail.sent.map((m) => m.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('async_payment_failed: 200, logged for the shop, no e-mail', async () => {
    const fake = stripeWithRealWebhooks();
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload('checkout.session.async_payment_failed', {
      id: SESSION_ID,
      object: 'checkout.session',
      payment_status: 'unpaid',
      metadata: { delivery_method: 'home' },
    });
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(mail.send).not.toHaveBeenCalled();
    const line = errors.map((l) => JSON.parse(l)).find((l) => l.msg === 'order.payment_failed');
    expect(line).toMatchObject({ sessionId: SESSION_ID, eventId: 'evt_test_1' });
  });

  it('completed but unpaid (async payment pending): 200, no e-mail yet', async () => {
    const fake = stripeWithRealWebhooks();
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload('checkout.session.completed', {
      id: SESSION_ID,
      object: 'checkout.session',
      payment_status: 'unpaid',
    });
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(fake.retrieve).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('other event types: 200 without work', async () => {
    const fake = stripeWithRealWebhooks();
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload('payment_intent.succeeded', {
      id: 'pi_1',
      object: 'payment_intent',
    });
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(fake.retrieve).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('400 INVALID_SIGNATURE and one config.missing line without STRIPE_WEBHOOK_SECRET', async () => {
    const fake = stripeWithRealWebhooks();
    const { app, mail } = makeApp({
      stripe: fake.stripe,
      env: { ...ENV, STRIPE_WEBHOOK_SECRET: '' },
    });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorJson).error.code).toBe('INVALID_SIGNATURE');
    expect(mail.send).not.toHaveBeenCalled();
    const missing = errors.map((l) => JSON.parse(l)).filter((l) => l.msg === 'config.missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ level: 'error', name: 'STRIPE_WEBHOOK_SECRET' });
    expect(missing[0].consequence).toContain('every Stripe event is refused');
  });

  it('a configured secret logs no config.missing line', async () => {
    const { app } = makeApp({ stripe: stripeWithRealWebhooks().stripe });
    const payload = eventPayload();
    await post(app, payload, await signed(payload));
    expect(errors.some((l) => l.includes('config.missing'))).toBe(false);
  });

  it('a mailer failure without status (network) answers 500 so Stripe retries, and logs it', async () => {
    const fake = stripeWithRealWebhooks();
    const { app, mail } = makeApp({ stripe: fake.stripe });
    mail.send.mockImplementationOnce(async () => {
      throw new Error('Resend refused the e-mail: HTTP 429 rate_limit_exceeded');
    });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(500);
    expect(((await res.json()) as ErrorJson).error.code).toBe('EMAIL_FAILED');
    // The owner e-mail failed: the customer e-mail waits for the retry.
    expect(mail.send).toHaveBeenCalledTimes(1);
    const failure = errors.find((l) => l.includes('order.email_failed'));
    expect(failure).toBeDefined();
    expect(JSON.parse(failure!)).toMatchObject({ recipient: 'owner', sessionId: SESSION_ID });
    expect(fake.update).not.toHaveBeenCalled();
  });

  it.each([429, 409, 500, 503])(
    'Resend %i is transient: 500 EMAIL_FAILED, session not marked',
    async (status) => {
      const fake = stripeWithRealWebhooks();
      const { app, mail } = makeApp({ stripe: fake.stripe });
      mail.send.mockImplementationOnce(async () => {
        throw new MailerError(`Resend refused the e-mail: HTTP ${status} x`, status);
      });
      const payload = eventPayload();
      const res = await post(app, payload, await signed(payload));
      expect(res.status).toBe(500);
      expect(((await res.json()) as ErrorJson).error.code).toBe('EMAIL_FAILED');
      expect(fake.update).not.toHaveBeenCalled();
      expect(mail.sent).toHaveLength(0);
      const failure = errors.find((l) => l.includes('order.email_failed'));
      expect(JSON.parse(failure!)).toMatchObject({ recipient: 'owner', status });
    },
  );

  it.each([403, 422])(
    'owner e-mail refused for good (Resend %i): 500 so Stripe retries, customer not e-mailed, not marked',
    async (status) => {
      const fake = stripeWithRealWebhooks();
      const { app, mail } = makeApp({ stripe: fake.stripe });
      mail.send.mockImplementationOnce(async () => {
        throw new MailerError(
          `Resend refused the e-mail: HTTP ${status} domain not verified`,
          status,
        );
      });
      const payload = eventPayload();
      const res = await post(app, payload, await signed(payload));
      expect(res.status).toBe(500);
      expect(((await res.json()) as ErrorJson).error.code).toBe('EMAIL_FAILED');
      expect(mail.send).toHaveBeenCalledOnce();
      expect(mail.sent).toHaveLength(0);
      expect(fake.update).not.toHaveBeenCalled();
      const refused = errors.find((l) => l.includes('order.email_refused'));
      expect(JSON.parse(refused!)).toMatchObject({ recipient: 'owner', status });
      const paid = JSON.parse(logs.find((l) => l.includes('order.paid'))!);
      expect(paid).toMatchObject({ emailsSent: 0, emailsRefused: 1, emailsFailed: 0 });
    },
  );

  it('owner out, customer failed transiently: marks owner_emailed, the retry e-mails the customer only', async () => {
    const fake = stripeWithRealWebhooks();
    const { app, mail } = makeApp({ stripe: fake.stripe });
    mail.send.mockImplementation(async (m) => {
      if (m.template === 'order_customer') throw new MailerError('HTTP 500', 500);
      mail.sent.push(m);
    });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(500);
    expect(mail.sent.map((m) => m.template)).toEqual(['order_owner']);
    expect(fake.update).toHaveBeenCalledExactlyOnceWith(SESSION_ID, {
      metadata: { owner_emailed: 'true' },
    });

    // Stripe redelivers (after Resend's 24 h key, too): the session says the owner is done.
    mail.send.mockReset();
    mail.send.mockImplementation(async (m) => void mail.sent.push(m));
    mail.sent.length = 0;
    fake.update.mockClear();
    fake.retrieve.mockResolvedValueOnce({
      ...sessionFixture({ metadata: { ...sessionFixture().metadata, owner_emailed: 'true' } }),
      line_items: undefined,
    } as never);
    const retry = await post(app, payload, await signed(payload));
    expect(retry.status).toBe(200);
    expect(mail.sent.map((m) => m.template)).toEqual(['order_customer']);
    expect(fake.update).toHaveBeenCalledExactlyOnceWith(SESSION_ID, {
      metadata: { emails_sent: 'true' },
    });
  });

  it.each([400, 403, 422])(
    'customer address refused for good (Resend %i): logged, counted as done, 200 and marked',
    async (status) => {
      const fake = stripeWithRealWebhooks();
      const { app, mail } = makeApp({ stripe: fake.stripe });
      // The customer address is refused for good; the owner e-mail goes out.
      mail.send.mockImplementation(async (m) => {
        if (m.to !== 'racinesenpartage@gmail.com') {
          throw new MailerError(
            `Resend refused the e-mail: HTTP ${status} validation_error`,
            status,
          );
        }
        mail.sent.push(m);
      });
      const payload = eventPayload();
      const res = await post(app, payload, await signed(payload));
      expect(res.status).toBe(200);
      expect(mail.sent.map((m) => m.to)).toEqual(['racinesenpartage@gmail.com']);
      expect(fake.update).toHaveBeenCalledOnce();
      const refused = errors.find((l) => l.includes('order.email_refused'));
      expect(JSON.parse(refused!)).toMatchObject({
        sessionId: SESSION_ID,
        recipient: 'customer',
        status,
      });
      expect(errors.join('\n')).not.toContain('awa.diallo');
      const paid = JSON.parse(logs.find((l) => l.includes('order.paid'))!);
      expect(paid).toMatchObject({ emailsSent: 1, emailsRefused: 1, emailsFailed: 0 });
    },
  );

  it('classifies mailer errors by status', () => {
    expect(isPermanentMailError(new MailerError('x', 422))).toBe(true);
    expect(isPermanentMailError(new MailerError('x', 429))).toBe(false);
    expect(isPermanentMailError(new MailerError('x', 409))).toBe(false);
    expect(isPermanentMailError(new MailerError('x', 502))).toBe(false);
    expect(isPermanentMailError(new MailerError('timeout'))).toBe(false);
    expect(isPermanentMailError(new Error('boom'))).toBe(false);
  });

  it('already notified (metadata.emails_sent): 200, nothing sent again', async () => {
    const fake = stripeWithRealWebhooks();
    fake.retrieve.mockResolvedValueOnce(
      sessionFixture({ metadata: { ...sessionFixture().metadata, emails_sent: 'true' } }),
    );
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload('checkout.session.completed', undefined, 'evt_redelivered');
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(mail.send).not.toHaveBeenCalled();
    expect(fake.listLineItems).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('a session this shop did not create (no delivery_method): 200 without work', async () => {
    const fake = stripeWithRealWebhooks();
    fake.retrieve.mockResolvedValueOnce(sessionFixture({ metadata: { plan: 'other-app' } }));
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(mail.send).not.toHaveBeenCalled();
    expect(fake.listLineItems).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('a listLineItems failure answers 502 so Stripe retries', async () => {
    const fake = stripeWithRealWebhooks();
    fake.listLineItems.mockRejectedValueOnce(new Error('timeout'));
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(502);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('e-mails list every line, beyond the 10 an expand would return', async () => {
    const fake = stripeWithRealWebhooks();
    const data = Array.from({ length: 12 }, (_, i) => ({
      id: `li_${i}`,
      description: `Produit ${i}`,
      quantity: 1,
      amount_subtotal: 100,
      amount_total: 100,
      price: { unit_amount: 100, product: { id: `prod_${i}`, metadata: { sku: `SKU-${i}` } } },
    }));
    fake.listLineItems.mockResolvedValueOnce({
      object: 'list',
      has_more: false,
      url: '/v1/checkout/sessions/x/line_items',
      data,
    } as never);
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    await post(app, payload, await signed(payload));
    expect(mail.sent[0]!.text).toContain('SKU-11');
  });

  it('a failure to mark the session is logged, the event still answers 200', async () => {
    const fake = stripeWithRealWebhooks();
    fake.update.mockRejectedValueOnce(new Error('socket hang up'));
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(mail.sent).toHaveLength(2);
    const line = errors.map((l) => JSON.parse(l)).find((l) => l.msg === 'order.mark_failed');
    expect(line).toMatchObject({ level: 'error', sessionId: SESSION_ID, key: 'emails_sent' });
    expect(line.consequence).toContain('would send the e-mails again');
  });

  it('a Stripe retrieve failure answers 502 so Stripe retries', async () => {
    const fake = stripeWithRealWebhooks();
    fake.retrieve.mockRejectedValueOnce(new Error('timeout'));
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(502);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('English order: customer e-mail in English, owner e-mail still French', async () => {
    const fake = stripeWithRealWebhooks();
    fake.retrieve.mockResolvedValueOnce(
      sessionFixture({
        locale: 'en',
        metadata: { locale: 'en', delivery_method: 'pickup', skus: 'REP-MOR-100' },
      }),
    );
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    await post(app, payload, await signed(payload));
    expect(mail.sent[0]!.subject).toBe(fr('Nouvelle commande E5F6G7H8 : 30,60 €'));
    expect(mail.sent[1]!.subject).toBe('Your Racines en Partage order no. E5F6G7H8');
  });

  it('without a customer e-mail, only the owner is notified', async () => {
    const fake = stripeWithRealWebhooks();
    fake.retrieve.mockResolvedValueOnce(
      sessionFixture({ customer_details: { name: null, email: null, phone: null, address: null } }),
    );
    const { app, mail } = makeApp({ stripe: fake.stripe });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    expect(mail.sent.map((m) => m.to)).toEqual(['racinesenpartage@gmail.com']);
  });

  it('NullMailer path (no RESEND_API_KEY): 200 and a redacted log line per e-mail', async () => {
    const { app } = makeApp({ stripe: stripeWithRealWebhooks().stripe, mailer: new NullMailer() });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    const skipped = logs.filter((l) => l.includes('mail.skipped')).map((l) => JSON.parse(l));
    expect(skipped).toHaveLength(2);
    expect(skipped.map((s) => s.to)).toEqual(['r***@***.com', 'a***@***.com']);
    expect(skipped[0]).toMatchObject({
      reason: 'RESEND_API_KEY is not set',
      idempotencyKey: 'evt_test_1',
    });
    expect(logs.join('\n')).not.toContain('awa.diallo');
  });
});
