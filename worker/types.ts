// Shared types of the Worker: environment, injected dependencies, delivery.
import type Stripe from 'stripe';
import type { Locale } from '../src/consts';

/** Bindings, variables and secrets of the deployed Worker (wrangler.jsonc, dashboard). */
export interface Env {
  ASSETS: Fetcher;
  SITE_URL: string;
  ORDER_EMAIL_FROM: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  ORDER_EMAIL_TO?: string;
  /** Rate limiting bindings (wrangler.jsonc `ratelimits`); absent in tests and older wrangler. */
  CHECKOUT_LIMITER?: RateLimiter;
  ORDERS_LIMITER?: RateLimiter;
}

/** The Workers rate limiting binding (`RateLimit` in @cloudflare/workers-types). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The part of the environment the API handlers read (no API key: clients are injected). */
export interface AppEnv {
  /** Absolute origin of the shop, "https://racinesenpartage.fr" (no trailing slash needed). */
  SITE_URL: string;
  /** Owner inbox for order e-mails; also the reply-to of customer e-mails. */
  ORDER_EMAIL_TO: string;
  /** Signing secret of the Stripe webhook endpoint, "whsec_...". */
  STRIPE_WEBHOOK_SECRET: string;
}

/** The Stripe surface the API uses, so tests inject a fake. */
export interface StripeLike {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session>;
      retrieve(
        id: string,
        params?: Stripe.Checkout.SessionRetrieveParams,
      ): Promise<Stripe.Checkout.Session>;
      listLineItems(
        id: string,
        params?: Stripe.Checkout.SessionListLineItemsParams,
      ): Promise<Stripe.ApiList<Stripe.LineItem>>;
      /** Stripe merges `metadata`: keys not sent are kept. */
      update(
        id: string,
        params: Stripe.Checkout.SessionUpdateParams,
      ): Promise<Stripe.Checkout.Session>;
    };
  };
  webhooks: {
    /** Verifies the signature (tolerance in seconds) and parses the event. */
    constructEventAsync(
      payload: string,
      signature: string,
      secret: string,
      toleranceSeconds?: number,
    ): Promise<Stripe.Event>;
  };
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Sent as the `Idempotency-Key` header, `<event id>:owner` or `<event id>:customer`. */
  idempotencyKey: string;
}

/** Sends one e-mail; rejects when the provider refuses it. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Relay point as the cart sends it (spec 6.1, 6.4). */
export interface RelayPoint {
  id: string;
  name: string;
  address1: string;
  address2?: string;
  postcode: string;
  city: string;
  country: string;
}

export type Delivery =
  { method: 'relay'; relay: RelayPoint } | { method: 'home' } | { method: 'pickup' };

export type { Locale };
