// Customer space (spec iteration 3, 8.6), /api/account/* mocked: logged out
// with the sign-in form, arrival with a sign-in link (valid and expired),
// logged in with orders (details, "Commander à nouveau", "Donner mon avis")
// and without, logout, a 401, the back/forward cache, axe.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { blockThirdParties, json, orderFixture, readCatalog } from './helpers';

const ACCOUNT = { fr: '/mon-compte/', en: '/en/account/' } as const;

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

/** Two orders: a recent one with SKU lines (one product gone), an old one without lines. */
async function ordersFixture(page: Page) {
  await page.goto('/boutique/');
  const catalog = (await readCatalog(page)) as unknown as {
    products: Record<string, { name: string; unitAmount: number; stock: string }>;
    maxQuantityPerLine: number;
  };
  const [sku] = Object.keys(catalog.products).filter((s) => catalog.products[s]!.stock !== 'out');
  const recent = {
    ...orderFixture([
      { name: catalog.products[sku!]!.name, quantity: 30, unitAmount: 890 },
      { name: 'Poudre disparue 100 g', quantity: 1, unitAmount: 500 },
    ]),
    lines: [
      { name: catalog.products[sku!]!.name, quantity: 30, unitAmount: 890, sku },
      { name: 'Poudre disparue 100 g', quantity: 1, unitAmount: 500, sku: 'REP-GONE-100' },
    ],
    id: 'cs_test_recent',
    number: 'X9Y8Z7W6',
    created: Math.floor(Date.UTC(2026, 10, 2, 10) / 1000),
    reviewable: true,
  };
  const old = {
    ...orderFixture([]),
    lines: [],
    amounts: { subtotal: 1780, shipping: 490, discount: 0, total: 2270, currency: 'eur' },
    id: 'cs_test_old',
    number: 'A1B2C3D4',
    created: '2026-09-14T08:00:00Z',
    reviewable: false,
    linesOmitted: true,
  };
  return { sku: sku!, catalog, orders: [recent, old] };
}

async function mockOrders(page: Page, orders: unknown[]) {
  await page.route('**/api/account/orders', (route) =>
    json(route, 200, { email: 'a***@gmail.com', orders }),
  );
}

test('logged out: the sign-in form sends a link', async ({ page }) => {
  await page.route('**/api/account/orders', (route) =>
    json(route, 401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
  );
  const calls: unknown[] = [];
  await page.route('**/api/account/login', (route) => {
    calls.push(route.request().postDataJSON());
    return json(route, 202, { ok: true });
  });
  await page.goto(ACCOUNT.fr);
  const form = page.locator('form[data-form="account_login"]');
  await expect(form).toBeVisible();
  await expect(form).toContainText('Pas de mot de passe');
  await expect(page.locator('[data-account-notice]')).toBeHidden();
  await form.getByLabel(/Votre e.mail/).fill('awa@gmail.com');
  await form.getByRole('button', { name: 'Recevoir mon lien de connexion' }).click();
  await expect(form.locator('[data-form-done]')).toContainText('Vérifiez votre boîte mail');
  await expect(form.locator('[data-form-done]')).toBeFocused();
  expect(calls).toEqual([{ email: 'awa@gmail.com', locale: 'fr' }]);
});

test('a sign-in link opens the space, strips the token and lists the orders', async ({ page }) => {
  const { orders, catalog, sku } = await ordersFixture(page);
  const sessions: unknown[] = [];
  await page.route('**/api/account/session', (route) => {
    sessions.push(route.request().postDataJSON());
    return json(route, 200, { ok: true, email: 'a***@gmail.com' });
  });
  await mockOrders(page, orders);
  await page.goto(`${ACCOUNT.fr}?t=login.tok-1`);
  const space = page.locator('[data-account-state="in"]');
  await expect(space).toBeVisible();
  expect(sessions).toEqual([{ token: 'login.tok-1' }]);
  expect(new URL(page.url()).search).toBe('');
  await expect(page.locator('a[hreflang="en"]').first()).toHaveAttribute(
    'href',
    '/en/account/?t=login.tok-1',
  );
  await expect(page.locator('[data-account-greeting]')).toContainText('a***@gmail.com');

  const cards = page.locator('[data-account-orders] > li');
  await expect(cards).toHaveCount(2);
  const first = cards.nth(0);
  await expect(first.getByRole('heading', { level: 3 })).toContainText('X9Y8Z7W6');
  await expect(first).toContainText('2 novembre 2026');
  await expect(first.locator('[data-o-status]')).toHaveText('Payée');
  await expect(first.getByRole('button', { name: /Donner mon avis/ })).toBeVisible();
  // The old order has no lines: no re-order, no review, a note in the details.
  const second = cards.nth(1);
  await expect(second.locator('[data-o-reorder]')).toBeHidden();
  await expect(second.locator('[data-o-review]')).toBeHidden();
  await second.locator('summary').click();
  await expect(second.locator('[data-o-omitted]')).toBeVisible();

  // Details: the shared order renderer.
  await first.locator('summary').click();
  await expect(first.locator('[data-thanks-lines] li')).toHaveCount(2);
  await expect(first.locator('[data-thanks-pickup]')).toBeVisible();

  // "Commander à nouveau": the known line, capped, then the drawer; the gone one is named.
  await first.getByRole('button', { name: /Commander à nouveau/ }).click();
  const drawer = page.locator('#cart-drawer');
  await expect(drawer).toBeVisible();
  await expect(
    drawer.locator(`[data-drawer-lines] li[data-sku="${sku}"] [data-line-qty]`),
  ).toHaveValue(String(catalog.maxQuantityPerLine));
  await expect(drawer.locator('[data-drawer-lines] li[data-sku]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(first.locator('[data-o-message]')).toContainText('Poudre disparue 100 g');
});

test('an expired sign-in link shows the message and the form', async ({ page }) => {
  await page.route('**/api/account/session', (route) =>
    json(route, 400, { error: { code: 'INVALID_TOKEN', message: 'x' } }),
  );
  await page.goto(`${ACCOUNT.en}?t=old`);
  await expect(page.locator('[data-account-notice]')).toHaveText(/expired, ask for a new one/);
  await expect(page.locator('form[data-form="account_login"]')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('logged in without orders: the empty sentence, then sign out', async ({ page }) => {
  await mockOrders(page, []);
  const logouts: string[] = [];
  await page.route('**/api/account/logout', (route) => {
    logouts.push(route.request().method());
    return json(route, 200, { ok: true });
  });
  await page.goto(ACCOUNT.fr);
  await expect(page.locator('[data-account-empty]')).toContainText(
    'Aucune commande avec cette adresse',
  );
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.locator('form[data-form="account_login"]')).toBeVisible();
  await expect(page.locator('[data-account-notice]')).toContainText('déconnecté');
  await expect(page.locator('[data-account-greeting]')).toBeEmpty();
  expect(logouts).toEqual(['POST']);
});

test('"Donner mon avis" opens the review page with a fresh token, or says it is done', async ({
  page,
}) => {
  const { orders } = await ordersFixture(page);
  await mockOrders(page, orders);
  let answer: 'token' | 'already' | 'unauth' = 'already';
  const bodies: unknown[] = [];
  await page.route('**/api/account/review-token', (route) => {
    bodies.push(route.request().postDataJSON());
    if (answer === 'token') return json(route, 200, { token: 'rev.tok' });
    if (answer === 'unauth')
      return json(route, 401, { error: { code: 'UNAUTHENTICATED', message: 'x' } });
    return json(route, 409, { error: { code: 'ALREADY_REVIEWED', message: 'x' } });
  });
  await page.goto(ACCOUNT.fr);
  const card = page.locator('[data-account-orders] > li').first();
  const review = card.getByRole('button', { name: /Donner mon avis/ });
  await review.click();
  await expect(card.locator('[data-o-message]')).toContainText('Vous avez déjà donné votre avis');
  expect(bodies).toEqual([{ sessionId: 'cs_test_recent' }]);

  answer = 'token';
  const navigation = page.waitForRequest((r) => r.url().includes('/avis/?t='));
  await review.click();
  expect(new URL((await navigation).url()).search).toBe('?t=rev.tok');

  // A session that expired in between: back to the sign-in form.
  await page.goto(ACCOUNT.fr);
  answer = 'unauth';
  await page
    .locator('[data-account-orders] > li')
    .first()
    .getByRole('button', { name: /Donner mon avis/ })
    .click();
  await expect(page.locator('form[data-form="account_login"]')).toBeVisible();
});

test('leaving the page forgets the orders', async ({ page }) => {
  const { orders } = await ordersFixture(page);
  await mockOrders(page, orders);
  await page.goto(ACCOUNT.fr);
  await expect(page.locator('[data-account-orders] > li')).toHaveCount(2);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await expect(page.locator('[data-account-orders] > li')).toHaveCount(0);
  await expect(page.locator('[data-account-greeting]')).toBeEmpty();
  await expect(page.locator('[data-account-state="in"]')).toBeHidden();
});

for (const locale of ['fr', 'en'] as const) {
  test(`axe: the space logged out and logged in (${locale})`, async ({ page }) => {
    const audit = async (label: string) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
        label,
      ).toEqual([]);
    };
    await page.route('**/api/account/orders', (route) =>
      json(route, 401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
    );
    await page.goto(ACCOUNT[locale]);
    await expect(page.locator('form[data-form="account_login"]')).toBeVisible();
    await audit(`out-${locale}`);

    const { orders } = await ordersFixture(page);
    await page.unroute('**/api/account/orders');
    await mockOrders(page, orders);
    await page.goto(ACCOUNT[locale]);
    await page.locator('[data-account-orders] > li').first().locator('summary').click();
    await expect(
      page.locator('[data-account-orders] [data-thanks-lines] li').first(),
    ).toBeVisible();
    await audit(`in-${locale}`);
  });
}
