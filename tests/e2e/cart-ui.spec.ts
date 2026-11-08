// Regressions from audit 13 (click paths): one overlay at a time on phones
// (C2), a capped add announced as such (C4), a checkout error that goes once
// the customer acts on it (C3), and the thanks page that keeps its order
// across languages (C6) and empties a paid cart on arrival (C7).
import { expect, test, type Page } from '@playwright/test';
import { PATHS, SESSION_ID, blockThirdParties, json, orderFixture } from './helpers';

const PRODUCT = '/produits/poudre-de-moringa-100g/';
const SKU = 'REP-MOR-100';

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

/** Puts `lines` in the stored cart, then opens `path`. */
async function seedCart(page: Page, lines: Array<{ sku: string; quantity: number }>, path: string) {
  await page.goto('/');
  await page.evaluate(
    (l) =>
      localStorage.setItem(
        'rep.cart.v1',
        JSON.stringify({ version: 1, lines: l, updatedAt: new Date().toISOString() }),
      ),
    lines,
  );
  await page.goto(path);
}

const storedCart = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('rep.cart.v1') ?? '{"lines":[]}') as {
        lines: Array<{ sku: string; quantity: number }>;
      },
  );

test('phone: opening the cart closes the menu, and Escape closes the cart (C2)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PRODUCT);
  const menu = page.locator('details.mobile-menu');
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  await page.locator('[data-cart-toggle]').filter({ visible: true }).first().click();
  const drawer = page.locator('#cart-drawer');
  await expect(drawer).toBeVisible();
  await expect(menu).not.toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('phone: Escape with the menu open still closes the menu (C2)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PRODUCT);
  const menu = page.locator('details.mobile-menu');
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
});

test('an add cut short by the maximum says so (C4)', async ({ page }) => {
  await seedCart(page, [{ sku: SKU, quantity: 7 }], PRODUCT);
  await page.fill(`input[data-qty-for="${SKU}"]`, '5');
  await page.locator('[data-buy-block] button[data-add-to-cart]').click();
  const live = page.locator('#cart-drawer [data-cart-live]');
  await expect(live).toContainText('quantité maximale atteinte');
  await expect(live).toContainText('10');
  expect((await storedCart(page)).lines).toEqual([{ sku: SKU, quantity: 10 }]);

  // A full add keeps the plain message.
  await page.keyboard.press('Escape');
  await seedCart(page, [{ sku: SKU, quantity: 2 }], '/en/products/poudre-de-moringa-100g/');
  await page.fill(`input[data-qty-for="${SKU}"]`, '3');
  await page.locator('[data-buy-block] button[data-add-to-cart]').click();
  await expect(live).toContainText('added to your basket');
  await expect(live).not.toContainText('maximum');
});

test('a delivery error goes once the customer picks another method (C3)', async ({ page }) => {
  await seedCart(page, [{ sku: SKU, quantity: 2 }], PATHS.fr.checkout);
  await page.locator('.method-card', { hasText: 'Retrait' }).click();
  await page.locator('[data-co-terms]').check();
  await page.route('**/api/checkout', (route) =>
    json(route, 409, { error: { code: 'SHIPPING_UNAVAILABLE', message: 'x' } }),
  );
  await page.locator('[data-co-pay]').click();
  const error = page.locator('[data-co-error]');
  await expect(error).toBeVisible();
  await page.check('input[name="delivery-method"][value="home"]', { force: true });
  await expect(error).toBeHidden();
  await expect(error).toBeEmpty();

  // Unchecking the terms also clears it.
  await page.locator('[data-co-pay]').click();
  await expect(error).toBeVisible();
  await page.locator('[data-co-terms]').uncheck();
  await expect(error).toBeHidden();
});

test('the language switch on the thanks page keeps the order (C6)', async ({ page }) => {
  const order = orderFixture([{ name: 'Poudre de moringa 100 g', quantity: 1, unitAmount: 890 }]);
  await page.route(`**/api/orders/${SESSION_ID}`, (route) => json(route, 200, order));
  await page.goto(`${PATHS.fr.thanks}?session_id=${SESSION_ID}`);
  const href = `${PATHS.en.thanks}?session_id=${SESSION_ID}`;
  // Every pill (header and mobile menu) carries the session id.
  const links = page.locator('a[hreflang="en"]');
  await expect(links.first()).toHaveAttribute('href', href);
  for (const link of await links.all()) await expect(link).toHaveAttribute('href', href);
  await page.goto(href);
  await expect(page).toHaveURL(new RegExp(`/en/thank-you/\\?session_id=${SESSION_ID}$`));
  await expect(page.locator('[data-thanks-order]')).toBeVisible();
});

test('the paid cart is emptied on arrival, even when the order cannot be loaded (C7)', async ({
  page,
}) => {
  await page.route('**/api/orders/**', (route) =>
    json(route, 502, { error: { code: 'PAYMENT_PROVIDER_ERROR', message: 'x' } }),
  );
  await seedCart(page, [{ sku: SKU, quantity: 2 }], `${PATHS.fr.thanks}?session_id=${SESSION_ID}`);
  await expect(page.locator('[data-cart-count]').first()).toHaveText('0');
  expect((await storedCart(page)).lines).toEqual([]);
});

test('a session that was not completed gives the cart back (C7)', async ({ page }) => {
  const order = {
    ...orderFixture([{ name: 'Poudre de moringa 100 g', quantity: 2, unitAmount: 890 }]),
    status: 'unpaid',
  };
  await page.route(`**/api/orders/${SESSION_ID}`, (route) => json(route, 200, order));
  await seedCart(page, [{ sku: SKU, quantity: 2 }], `${PATHS.fr.thanks}?session_id=${SESSION_ID}`);
  await expect(page.locator('[data-thanks-cart]')).toBeVisible();
  await expect(page.locator('[data-cart-count]').first()).toHaveText('2');
  expect((await storedCart(page)).lines).toEqual([{ sku: SKU, quantity: 2 }]);
});
