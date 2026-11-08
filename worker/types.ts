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
  /** HMAC key of the review and newsletter tokens (32 random bytes, base64). */
  FORMS_SECRET?: string;
  /** Fine-grained GitHub token, contents read and write on GITHUB_REPO only. */
  GITHUB_TOKEN?: string;
  /** "owner/name" of the repository the reviews are committed to. */
  GITHUB_REPO?: string;
  /** Turnstile secret; empty refuses the contact and newsletter forms (see below). */
  TURNSTILE_SECRET_KEY?: string;
  /** 'true' lets the forms work without Turnstile: local development only, never deployed. */
  FORMS_ALLOW_WITHOUT_CAPTCHA?: string;
  /** Daily ceiling of form-triggered e-mails (default 60); needs FORMS_KV. */
  FORMS_DAILY_LIMIT?: string;
  /** KV namespace of the daily form budget; absent means no budget. */
  FORMS_KV?: KVNamespace;
  /** Resend audience of the newsletter; empty disables the newsletter endpoints. */
  RESEND_AUDIENCE_ID?: string;
  /** Rate limiting bindings (wrangler.jsonc `ratelimits`); absent in tests and older wrangler. */
  CHECKOUT_LIMITER?: RateLimiter;
  ORDERS_LIMITER?: RateLimiter;
  FORMS_LIMITER?: RateLimiter;
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
  /** HMAC key of the review and newsletter tokens; without it those endpoints are disabled. */
  FORMS_SECRET?: string;
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
      /** Newest first; `starting_after` pages through older ones. */
      list(
        params?: Stripe.Checkout.SessionListParams,
      ): Promise<Stripe.ApiList<Stripe.Checkout.Session>>;
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
  /** Which e-mail this is, for logs (never the subject, which may carry a name). */
  template?: string;
}

/** Sends one e-mail; rejects when the provider refuses it. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Cloudflare Turnstile `siteverify`; true when the token is valid (or checks are off). */
export interface Captcha {
  verify(token: string | undefined, remoteIp: string | null): Promise<boolean>;
}

/** The newsletter audience (Resend contacts); resolves when the address is subscribed. */
export interface Audience {
  addContact(email: string): Promise<void>;
}

/** Writes one new file to the repository; `exists` when the path is already taken. */
export interface ReviewRepo {
  createFile(path: string, content: string, message: string): Promise<'created' | 'exists'>;
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
