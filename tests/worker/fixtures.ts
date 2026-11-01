// Fixture catalogue (mirrors dist/catalog.json), fake Stripe, fake mailer.
import type Stripe from 'stripe';
import { vi } from 'vitest';
import { createApp, type AppDeps } from '../../worker/app';
import type { WorkerCatalog } from '../../worker/catalog';
import type { AppEnv, MailMessage, Mailer, RateLimiter, StripeLike } from '../../worker/types';

export const NOW = new Date('2026-11-01T18:00:00.000Z');

export function catalogFixture(overrides: Partial<WorkerCatalog> = {}): WorkerCatalog {
  return {
    generatedAt: '2026-11-01T17:43:53.780Z',
    currency: 'eur',
    vatMode: 'franchise',
    shopOpen: true,
    maxQuantityPerLine: 10,
    freeShippingFrom: 4900,
    shipping: [
      {
        id: 'relay',
        enabled: true,
        amount: 490,
        countries: ['FR', 'BE', 'LU'],
        label: { fr: 'Point Relais Mondial Relay', en: 'Mondial Relay pickup point' },
        estimate: { fr: '3 à 5 jours ouvrés', en: '3 to 5 working days' },
      },
      {
        id: 'home',
        enabled: true,
        amount: 690,
        countries: ['FR'],
        label: { fr: 'Livraison à domicile (Colissimo)', en: 'Home delivery (Colissimo)' },
        estimate: { fr: '2 à 4 jours ouvrés', en: '2 to 4 working days' },
      },
      {
        id: 'pickup',
        enabled: true,
        amount: 0,
        countries: ['FR'],
        label: { fr: 'Retrait gratuit à Arnouville', en: 'Free pickup in Arnouville' },
        estimate: { fr: 'sur rendez-vous, 9 Rue du Marché', en: 'by appointment, 9 Rue du Marché' },
      },
    ],
    products: [
      {
        sku: 'REP-MOR-100',
        slug: 'poudre-de-moringa-100g',
        unitAmount: 890,
        weightGrams: 100,
        stock: 'in_stock',
        name: { fr: 'Poudre de moringa 100 g', en: 'Moringa powder 100 g' },
        image: 'https://racinesenpartage.fr/_astro/moringa-100.CvuMJeko_Z1Kskv4.webp',
      },
      {
        sku: 'REP-BAO-100',
        slug: 'poudre-de-baobab-100g',
        unitAmount: 790,
        weightGrams: 100,
        stock: 'low',
        name: { fr: 'Poudre de baobab 100 g', en: 'Baobab powder 100 g' },
        image: 'https://racinesenpartage.fr/_astro/baobab-100.B695tBd0_Z1diFfw.webp',
      },
      {
        sku: 'REP-ORG-100',
        slug: 'poudre-d-orge-grillee-100g',
        unitAmount: 590,
        weightGrams: 100,
        stock: 'out',
        name: { fr: "Poudre d'orge grillée 100 g", en: 'Roasted barley flour 100 g' },
        image: 'https://racinesenpartage.fr/_astro/orge-grillee-100.CJ5voqDO_xBe2G.webp',
      },
      {
        sku: 'REP-SOU-P100',
        slug: 'poudre-de-souchet-100g',
        unitAmount: 690,
        weightGrams: 100,
        stock: 'out',
        name: { fr: 'Poudre de souchet 100 g', en: 'Tiger nut powder 100 g' },
        image: 'https://racinesenpartage.fr/_astro/souchet-poudre-100.webp',
      },
    ],
    ...overrides,
  };
}

export const ENV: AppEnv = {
  SITE_URL: 'https://racinesenpartage.fr',
  ORDER_EMAIL_TO: 'racinesenpartage@outlook.com',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
};

export const SESSION_ID = 'cs_test_a1B2c3D4e5F6g7H8';

export const RELAY = {
  id: 'FR-012345',
  name: 'Tabac de la Gare',
  address1: '12 Avenue de la Gare',
  address2: 'Galerie marchande',
  postcode: '95400',
  city: 'Arnouville',
  country: 'FR',
  hoursHtml: '<table><tr><td>Lundi</td></tr></table>',
};

/** A retrieved, expanded, paid session as Stripe returns it (fields the Worker reads). */
export function sessionFixture(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
  const session = {
    id: SESSION_ID,
    object: 'checkout.session',
    created: Date.UTC(2026, 10, 1, 17, 30) / 1000,
    currency: 'eur',
    locale: 'fr',
    status: 'complete',
    payment_status: 'paid',
    amount_subtotal: 2570,
    amount_total: 3060,
    payment_intent: 'pi_3TestPaymentIntent',
    metadata: {
      locale: 'fr',
      delivery_method: 'relay',
      relay_id: 'FR-012345',
      relay_name: 'Tabac de la Gare',
      relay_address: '12 Avenue de la Gare, Galerie marchande',
      relay_postcode: '95400',
      relay_city: 'Arnouville',
      relay_country: 'FR',
      skus: 'REP-MOR-100,REP-BAO-100',
    },
    customer_details: {
      name: 'Awa Diallo',
      email: 'awa.diallo@example.com',
      phone: '+33612345678',
      address: {
        line1: '3 Rue des Lilas',
        line2: null,
        postal_code: '95400',
        city: 'Arnouville',
        state: null,
        country: 'FR',
      },
    },
    collected_information: null,
    shipping_cost: {
      amount_subtotal: 490,
      amount_tax: 0,
      amount_total: 490,
      shipping_rate: { id: 'shr_test', display_name: 'Point Relais Mondial Relay' },
    },
    total_details: { amount_discount: 0, amount_shipping: 490, amount_tax: 0 },
    line_items: {
      object: 'list',
      has_more: false,
      url: '/v1/checkout/sessions/cs_test/line_items',
      data: [
        {
          id: 'li_1',
          description: 'Poudre de moringa 100 g',
          quantity: 2,
          amount_subtotal: 1780,
          amount_total: 1780,
          price: { unit_amount: 890, product: { id: 'prod_1', metadata: { sku: 'REP-MOR-100' } } },
        },
        {
          id: 'li_2',
          description: 'Poudre de baobab 100 g',
          quantity: 1,
          amount_subtotal: 790,
          amount_total: 790,
          price: { unit_amount: 790, product: { id: 'prod_2', metadata: { sku: 'REP-BAO-100' } } },
        },
      ],
    },
    ...overrides,
  };
  return session as unknown as Stripe.Checkout.Session;
}

export function fakeStripe() {
  const create = vi.fn(
    async (_params: Stripe.Checkout.SessionCreateParams) =>
      ({
        id: SESSION_ID,
        url: `https://checkout.stripe.com/c/pay/${SESSION_ID}`,
      }) as unknown as Stripe.Checkout.Session,
  );
  // Without `expand: ['line_items']` Stripe returns no lines: they come from listLineItems.
  const retrieve = vi.fn(
    async (_id: string, _params?: Stripe.Checkout.SessionRetrieveParams) =>
      ({ ...sessionFixture(), line_items: undefined }) as unknown as Stripe.Checkout.Session,
  );
  const listLineItems = vi.fn(
    async (_id: string, _params?: Stripe.Checkout.SessionListLineItemsParams) =>
      sessionFixture().line_items as Stripe.ApiList<Stripe.LineItem>,
  );
  /** Echoes the session with the new metadata merged in, as Stripe does. */
  const update = vi.fn(async (_id: string, params: Stripe.Checkout.SessionUpdateParams) =>
    sessionFixture({
      metadata: { ...sessionFixture().metadata, ...(params.metadata || {}) },
    }),
  );
  const constructEventAsync = vi.fn(
    async (payload: string, _signature: string, _secret: string, _tolerance?: number) =>
      JSON.parse(payload) as Stripe.Event,
  );
  const stripe: StripeLike = {
    checkout: { sessions: { create, retrieve, listLineItems, update } },
    webhooks: { constructEventAsync },
  };
  return { stripe, create, retrieve, listLineItems, update, constructEventAsync };
}

/** A Workers rate limiting binding that allows `allowed` calls, then refuses. */
export function fakeLimiter(allowed = Infinity) {
  const keys: string[] = [];
  const limit = vi.fn(async ({ key }: { key: string }) => {
    keys.push(key);
    return { success: keys.length <= allowed };
  });
  const limiter: RateLimiter = { limit };
  return { limiter, limit, keys };
}

export function fakeMailer() {
  const sent: MailMessage[] = [];
  const send = vi.fn(async (message: MailMessage) => {
    sent.push(message);
  });
  const mailer: Mailer = { send };
  return { mailer, sent, send };
}

export function makeApp(overrides: Partial<AppDeps> = {}, catalog = catalogFixture()) {
  const stripe = fakeStripe();
  const mail = fakeMailer();
  const loadCatalog = vi.fn(async () => catalog);
  const app = createApp({
    stripe: stripe.stripe,
    mailer: mail.mailer,
    loadCatalog,
    env: ENV,
    now: () => NOW,
    ...overrides,
  });
  return { app, stripe, mail, loadCatalog };
}

export const SAME_ORIGIN = { Origin: 'https://racinesenpartage.fr' };

export function postJson(
  app: ReturnType<typeof makeApp>['app'],
  path: string,
  body: unknown,
  headers: Record<string, string> = SAME_ORIGIN,
) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export interface ErrorJson {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/** French prices use a narrow no-break space before the euro sign: write " €" in tests. */
export const fr = (text: string) => text.replaceAll(' €', '\u202f€');
