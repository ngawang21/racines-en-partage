import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NullMailer } from '../../worker/email/resend';
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
      expand: ['line_items', 'line_items.data.price.product', 'shipping_cost.shipping_rate'],
    });
    expect(mail.sent).toHaveLength(2);
    const [owner, customer] = mail.sent;
    expect(owner).toMatchObject({
      to: 'racinesenpartage@outlook.com',
      replyTo: 'awa.diallo@example.com',
      idempotencyKey: 'evt_test_1:racinesenpartage@outlook.com',
      subject: fr('Nouvelle commande E5F6G7H8 : 30,60 €'),
    });
    expect(customer).toMatchObject({
      to: 'awa.diallo@example.com',
      replyTo: 'racinesenpartage@outlook.com',
      idempotencyKey: 'evt_test_1:awa.diallo@example.com',
      subject: 'Merci pour votre commande E5F6G7H8',
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
      'evt_async:racinesenpartage@outlook.com',
      'evt_async:awa.diallo@example.com',
    ]);
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

  it('a mailer failure answers 500 so Stripe retries, and logs it', async () => {
    const { app, mail } = makeApp({ stripe: stripeWithRealWebhooks().stripe });
    mail.send.mockImplementationOnce(async () => {
      throw new Error('Resend refused the e-mail: HTTP 429 rate_limit_exceeded');
    });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(500);
    expect(((await res.json()) as ErrorJson).error.code).toBe('EMAIL_FAILED');
    expect(mail.send).toHaveBeenCalledTimes(2);
    const failure = errors.find((l) => l.includes('order.email_failed'));
    expect(failure).toBeDefined();
    expect(JSON.parse(failure!)).toMatchObject({ recipient: 'owner', sessionId: SESSION_ID });
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
    expect(mail.sent[1]!.subject).toBe('Thank you for your order E5F6G7H8');
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
    expect(mail.sent.map((m) => m.to)).toEqual(['racinesenpartage@outlook.com']);
  });

  it('NullMailer path (no RESEND_API_KEY): 200 and a redacted log line per e-mail', async () => {
    const { app } = makeApp({ stripe: stripeWithRealWebhooks().stripe, mailer: new NullMailer() });
    const payload = eventPayload();
    const res = await post(app, payload, await signed(payload));
    expect(res.status).toBe(200);
    const skipped = logs.filter((l) => l.includes('mail.skipped')).map((l) => JSON.parse(l));
    expect(skipped).toHaveLength(2);
    expect(skipped.map((s) => s.to)).toEqual(['r***@outlook.com', 'a***@example.com']);
    expect(skipped[0]).toMatchObject({
      reason: 'RESEND_API_KEY is not set',
      idempotencyKey: 'evt_test_1',
    });
    expect(logs.join('\n')).not.toContain('awa.diallo');
  });
});
