// Worker entry: /api/* goes to the Hono app, everything else to the static
// assets (wrangler.jsonc runs this Worker first for /api/* only).
import { createApp } from './app';
import { assetCatalogFetcher, createCatalogCache } from './catalog';
import { NullMailer, ResendMailer } from './email/resend';
import { getStripeClient } from './stripe';
import type { Env } from './types';

const catalogCache = createCatalogCache();

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (!isApiPath(url.pathname)) return env.ASSETS.fetch(request);

    const now = () => new Date();
    const fetchCatalog = assetCatalogFetcher(env.ASSETS, url.origin);
    const app = createApp({
      stripe: getStripeClient(env.STRIPE_SECRET_KEY),
      mailer: env.RESEND_API_KEY
        ? new ResendMailer(env.RESEND_API_KEY, env.ORDER_EMAIL_FROM)
        : new NullMailer(),
      loadCatalog: () => catalogCache.get(fetchCatalog, now),
      env: {
        SITE_URL: env.SITE_URL,
        ORDER_EMAIL_TO: env.ORDER_EMAIL_TO ?? '',
        STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ?? '',
      },
      now,
      limiters: { checkout: env.CHECKOUT_LIMITER, orders: env.ORDERS_LIMITER },
    });
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
