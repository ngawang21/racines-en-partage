// Regressions from audit 13 (click paths): one overlay at a time on phones
// (C2), a capped add announced as such (C4), a checkout error that goes once
// the customer acts on it (C3), and the thanks page that keeps its order
// across languages (C6) and empties a paid cart on arrival (C7).
import { expect, test, type Page } from '@playwright/test';
import { PATHS, SESSION_ID, blockThirdParties, json, orderFixture, readCatalog } from './helpers';

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
  await expect(page.locator('h1')).toHaveText('Paiement non abouti');
  await expect(page.locator('[data-cart-count]').first()).toHaveText('2');
  expect((await storedCart(page)).lines).toEqual([{ sku: SKU, quantity: 2 }]);
});

test('the maximum per product is visible under the stepper and on the cart lines (review 13)', async ({
  page,
}) => {
  await seedCart(page, [{ sku: SKU, quantity: 7 }], PRODUCT);
  const { maxQuantityPerLine: max } = await readCatalog(page);
  const note = `${max} sachets maximum par produit. Pour plus, écrivez‑nous.`;
  const qty = page.locator(`input[data-qty-for="${SKU}"]`);
  const pageNote = page.locator('.qty-cap');
  await expect(pageNote).toHaveCount(0);

  // Typed past the maximum: the field drops to it and says so, visibly.
  await qty.fill(String(max + 2));
  await qty.press('Tab');
  await expect(qty).toHaveValue(String(max));
  await expect(pageNote).toBeVisible();
  await expect(pageNote).toHaveText(note);
  await expect(pageNote.getByRole('link')).toHaveAttribute('href', '/contact/');
  expect((await qty.getAttribute('aria-describedby')) ?? '').toContain(
    (await pageNote.getAttribute('id'))!,
  );

  // The add stops at the maximum; the drawer line explains why + is grey.
  await page.locator('[data-buy-block] button[data-add-to-cart]').click();
  const drawer = page.locator('#cart-drawer');
  const line = drawer.locator(`li[data-sku="${SKU}"]`);
  await expect(line.locator('[data-line-qty]')).toHaveValue(String(max));
  await expect(line.locator('[data-line-cap]')).toBeVisible();
  await expect(line.locator('[data-line-cap]')).toHaveText(note);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  // Pressed again at the maximum: the drawer opens, nothing changes, the
  // visible lines say why (and the live region still announces it).
  await qty.fill('1');
  await qty.press('Tab');
  await expect(qty).toHaveValue('1');
  await expect(pageNote).toBeVisible();
  await page.locator('[data-buy-block] button[data-add-to-cart]').click();
  await expect(drawer).toBeVisible();
  await expect(line.locator('[data-line-cap]')).toBeVisible();
  await expect(drawer.locator('[data-cart-live]')).toContainText(`${max} sachets au maximum`);
  expect((await storedCart(page)).lines).toEqual([{ sku: SKU, quantity: max }]);

  // One less: the notes go.
  await line.locator('[data-line-step="-1"]').click();
  await expect(line.locator('[data-line-cap]')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(pageNote).toBeHidden();

  // The cart page line says it too.
  await seedCart(page, [{ sku: SKU, quantity: max }], PATHS.fr.cart);
  await expect(
    page.locator(`[data-cart-page-lines] li[data-sku="${SKU}"] [data-line-cap]`),
  ).toHaveText(note);
});

test('a "#recipe" link lands on the open panel with the focus but no ring (review 13)', async ({
  page,
}) => {
  await page.goto(PRODUCT);
  test.skip((await page.locator('#recipe').count()) === 0, 'no recipe on this product');
  await page.goto('/');
  await page.goto(`${PRODUCT}#recipe`);
  const panel = page
    .locator('#recipe')
    .locator('xpath=ancestor::div[contains(@class,"acc-body")][1]');
  await expect(panel).toBeFocused();
  await expect(panel).toBeInViewport();
  expect(await panel.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await expect(page.locator('details:has(#recipe) > summary')).not.toBeFocused();
});

for (const path of ['/mon-compte/', '/ma-commande/']) {
  test(`${path} sits on the page edge, not centred (review 13)`, async ({ page }) => {
    await page.goto(path);
    const title = page.locator('main h1');
    const form = page.locator('main form').first();
    await expect(form).toBeVisible();
    const t = (await title.boundingBox())!;
    const f = (await form.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(Math.abs(t.x - f.x)).toBeLessThan(2);
    expect(t.x).toBeLessThan(width / 6);
    expect(await title.evaluate((el) => getComputedStyle(el).textAlign)).not.toBe('center');
  });
}
