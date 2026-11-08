// Worker entry: /api/* goes to the Hono app, everything else to the static
// assets (wrangler.jsonc runs this Worker first for /api/* only). The daily
// Cron Trigger sends the review invitations.
import { createApp } from './app';
import { assetCatalogFetcher, createCatalogCache } from './catalog';
import { NullMailer, ResendAudience, ResendMailer } from './email/resend';
import { createGitHubRepo } from './github';
import { logError } from './log';
import { inviteReviews } from './reviews';
import { getStripeClient } from './stripe';
import { createTurnstile } from './turnstile';
import type { Env, Mailer } from './types';

const catalogCache = createCatalogCache();

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function mailerFor(env: Env): Mailer {
  return env.RESEND_API_KEY
    ? new ResendMailer(env.RESEND_API_KEY, env.ORDER_EMAIL_FROM)
    : new NullMailer();
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (!isApiPath(url.pathname)) return env.ASSETS.fetch(request);

    const now = () => new Date();
    const fetchCatalog = assetCatalogFetcher(env.ASSETS, url.origin);
    const app = createApp({
      stripe: getStripeClient(env.STRIPE_SECRET_KEY),
      mailer: mailerFor(env),
      loadCatalog: () => catalogCache.get(fetchCatalog, now),
      env: {
        SITE_URL: env.SITE_URL,
        ORDER_EMAIL_TO: env.ORDER_EMAIL_TO ?? '',
        STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ?? '',
        FORMS_SECRET: env.FORMS_SECRET ?? '',
      },
      now,
      limiters: {
        checkout: env.CHECKOUT_LIMITER,
        orders: env.ORDERS_LIMITER,
        forms: env.FORMS_LIMITER,
      },
      captcha: createTurnstile(env.TURNSTILE_SECRET_KEY),
      // The newsletter needs both the audience and an API key to reach it.
      ...(env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID
        ? { audience: new ResendAudience(env.RESEND_API_KEY, env.RESEND_AUDIENCE_ID) }
        : {}),
      ...(env.GITHUB_TOKEN && env.GITHUB_REPO
        ? { reviewRepo: createGitHubRepo(env.GITHUB_TOKEN, env.GITHUB_REPO) }
        : {}),
    });
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, _ctx): Promise<void> {
    // Logging instead of sending would mark the sessions invited for nothing.
    if (!env.RESEND_API_KEY) {
      logError('config.missing', { name: 'RESEND_API_KEY', job: 'review_invitations' });
      return;
    }
    await inviteReviews(
      {
        stripe: getStripeClient(env.STRIPE_SECRET_KEY),
        mailer: mailerFor(env),
        // No request here: the catalogue is read through ASSETS on the shop's origin.
        loadCatalog: () =>
          catalogCache.get(
            assetCatalogFetcher(env.ASSETS, new URL(env.SITE_URL).origin),
            () => new Date(),
          ),
        env: {
          SITE_URL: env.SITE_URL,
          ORDER_EMAIL_TO: env.ORDER_EMAIL_TO ?? '',
          FORMS_SECRET: env.FORMS_SECRET ?? '',
        },
      },
      new Date(controller.scheduledTime),
    );
  },
} satisfies ExportedHandler<Env>;
