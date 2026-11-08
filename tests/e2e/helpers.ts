import type { Page, Route } from '@playwright/test';

export type Locale = 'fr' | 'en';

export const PATHS = {
  fr: { shop: '/boutique/', cart: '/panier/', checkout: '/commande/', thanks: '/merci/' },
  en: { shop: '/en/shop/', cart: '/en/cart/', checkout: '/en/checkout/', thanks: '/en/thank-you/' },
} as const;

export const SESSION_ID = 'cs_test_123';

/** Keep the tests hermetic: third-party hosts (Mondial Relay, CDNs) never load. */
export async function blockThirdParties(page: Page): Promise<void> {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
}

/** The client catalogue embedded in the page. */
export async function readCatalog(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(document.getElementById('rep-catalog')!.textContent!) as {
        products: Record<
          string,
          { name: string; unitAmount: number; stock: string; slug: string; category: string }
        >;
        freeShippingFrom: number | null;
        maxQuantityPerLine: number;
        shipping: Array<{ id: 'relay' | 'home' | 'pickup'; amount: number }>;
      },
  );
}

/** Formats cents the way the shop does, in the page (same ICU as the client). */
export async function formatInPage(page: Page, cents: number, locale: Locale): Promise<string> {
  return page.evaluate(
    ([c, l]) => {
      const text = new Intl.NumberFormat(l === 'fr' ? 'fr-FR' : 'en-GB', {
        style: 'currency',
        currency: 'EUR',
      }).format((c as number) / 100);
      return l === 'fr' ? text.replaceAll(' ', ' ') : text;
    },
    [cents, locale] as const,
  );
}

export function orderFixture(items: Array<{ name: string; quantity: number; unitAmount: number }>) {
  const subtotal = items.reduce((s, l) => s + l.quantity * l.unitAmount, 0);
  return {
    status: 'paid',
    number: 'RP-2026-0042',
    lines: items,
    amounts: { subtotal, shipping: 0, discount: 0, total: subtotal, currency: 'eur' },
    delivery: { method: 'pickup' },
    email: 'm***@example.com',
  };
}

export const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** "49 €" rather than "49,00 €", as the cart prints a round threshold. */
export const wholePrice = (formatted: string) => formatted.replace(/[,.]00(?=\D|$)/, '');

/** The display price of the relay method for `subtotal` (free from the threshold). */
export function relayShipping(
  catalog: Awaited<ReturnType<typeof readCatalog>>,
  subtotal: number,
): number {
  const relay = catalog.shipping.find((s) => s.id === 'relay')!.amount;
  const threshold = catalog.freeShippingFrom;
  return threshold !== null && subtotal >= threshold ? 0 : relay;
}
