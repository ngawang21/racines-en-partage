// The real Stripe client for the Workers runtime: fetch HTTP client and the
// SubtleCrypto provider for webhook signatures.
import Stripe from 'stripe';
import type { StripeLike } from './types';

/** Pinned to the version the installed SDK (stripe 23.1.0) is generated for. */
export const STRIPE_API_VERSION = '2026-10-28.endive' as const;

export function createStripeClient(secretKey: string): StripeLike {
  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 1,
    timeout: 15_000,
  });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  return {
    checkout: {
      sessions: {
        create: (params) => stripe.checkout.sessions.create(params),
        retrieve: (id, params) => stripe.checkout.sessions.retrieve(id, params),
        list: async (params) => await stripe.checkout.sessions.list(params),
        listLineItems: async (id, params) =>
          await stripe.checkout.sessions.listLineItems(id, params),
        update: (id, params) => stripe.checkout.sessions.update(id, params),
      },
    },
    webhooks: {
      constructEventAsync: (payload, signature, secret, toleranceSeconds) =>
        stripe.webhooks.constructEventAsync(
          payload,
          signature,
          secret,
          toleranceSeconds,
          cryptoProvider,
        ),
    },
  };
}

/** A client that fails every call: used when `STRIPE_SECRET_KEY` is not set. */
export function missingStripeClient(): StripeLike {
  const fail = () => Promise.reject(new Error('STRIPE_SECRET_KEY is not set'));
  return {
    checkout: {
      sessions: { create: fail, retrieve: fail, list: fail, listLineItems: fail, update: fail },
    },
    webhooks: { constructEventAsync: fail },
  };
}

let cached: { key: string; client: StripeLike } | null = null;

/** One client per isolate and key. */
export function getStripeClient(secretKey: string | undefined): StripeLike {
  if (!secretKey) return missingStripeClient();
  if (cached?.key !== secretKey) cached = { key: secretKey, client: createStripeClient(secretKey) };
  return cached.client;
}
