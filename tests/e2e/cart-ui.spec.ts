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

// Review 14 -----------------------------------------------------------------

declare global {
  interface Window {
    __cls?: number;
  }
}

const CLS_PAGES = [
  { path: PATHS.fr.cart, ready: '[data-cart-page-content]', chunk: 'page-cart' },
  { path: PATHS.fr.checkout, ready: '[data-checkout-content]', chunk: 'page-checkout' },
  { path: '/mon-compte/', ready: '[data-account-state="out"]', chunk: 'page-account' },
] as const;

for (const { path, ready, chunk } of CLS_PAGES) {
  test(`${path} does not shift when the browser fills it in: CLS under 0.05 (B1)`, async ({
    page,
  }) => {
    // Phone project at 390 x 844, desktop measured at 1440 x 900.
    if ((page.viewportSize()?.width ?? 0) >= 900)
      await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/api/account/orders', (route) =>
      json(route, 401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
    );
    // The page's module is held until the shell has painted, as on a slow
    // phone: whatever the first paint shows must not move afterwards.
    let release = () => {};
    const painted = new Promise<void>((resolve) => (release = resolve));
    await page.route(new RegExp(`/_astro/${chunk}\\.[\\w-]+\\.js$`), async (route) => {
      await painted;
      await route.continue();
    });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<
          PerformanceEntry & { value: number; hadRecentInput: boolean }
        >)
          if (!entry.hadRecentInput) window.__cls! += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await seedCart(
      page,
      [
        { sku: SKU, quantity: 2 },
        { sku: 'REP-BAO-100', quantity: 1 },
      ],
      path,
    );
    const frames = () =>
      page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    await page.waitForFunction(
      () => performance.getEntriesByName('first-contentful-paint').length > 0,
    );
    await frames();
    release();
    await expect(page.locator(ready)).toBeVisible();
    // Layout-shift entries arrive after the frame that caused them.
    await frames();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.05);
  });
}

test('Back with the drawer open closes it and stays on the page (B5)', async ({ page }) => {
  await page.goto('/');
  await page.goto(PATHS.fr.shop);
  const drawer = page.locator('#cart-drawer');
  const toggle = page.locator('[data-cart-toggle]').filter({ visible: true }).first();
  await toggle.click();
  await expect(drawer).toBeVisible();
  await page.goBack();
  await expect(drawer).toBeHidden();
  expect(new URL(page.url()).pathname).toBe(PATHS.fr.shop);
  await expect(page.locator('html')).not.toHaveClass(/has-drawer/);
  await expect(toggle).toBeFocused();

  // Escape (and the close button) leave no entry behind: Back then leaves the page.
  await toggle.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await toggle.click();
  await drawer.locator('[data-drawer-close]').click();
  await expect(drawer).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.history.state)).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('an empty cart shows four products under its message, in the drawer and on the page', async ({
  page,
}) => {
  await page.goto(PATHS.fr.cart);
  const featured = page.locator('main [data-cart-featured]');
  await expect(page.locator('[data-cart-page-empty]')).toBeVisible();
  await expect(featured).toBeVisible();
  await expect(featured.getByRole('heading')).toHaveText('Nos incontournables');
  await expect(featured.locator('[data-cross-sell-sku]')).toHaveCount(4);

  // The drawer, too; an add from it fills the cart and the list goes.
  await page.locator('[data-cart-toggle]').filter({ visible: true }).first().click();
  const drawer = page.locator('#cart-drawer');
  const inDrawer = drawer.locator('[data-cart-featured]');
  await expect(inDrawer.locator('[data-cross-sell-sku]')).toHaveCount(4);
  const sku = (await inDrawer
    .locator('[data-cross-sell-sku]')
    .first()
    .getAttribute('data-cross-sell-sku'))!;
  await inDrawer.locator('button[data-add-to-cart]').first().click();
  await expect(drawer.locator(`li[data-sku="${sku}"] .cart-line-name`)).toBeFocused();
  await expect(inDrawer).toBeHidden();
  expect((await storedCart(page)).lines).toEqual([{ sku, quantity: 1 }]);
  await expect(featured).toBeHidden();
});

test('phone cart lines: "Retirer" on the stepper row, a line about 200 px tall', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCart(
    page,
    [
      { sku: SKU, quantity: 2 },
      { sku: 'REP-BAO-100', quantity: 1 },
    ],
    PATHS.fr.cart,
  );
  const lines = page.locator('[data-cart-page-lines] > li');
  await expect(lines).toHaveCount(2);
  for (const line of await lines.all()) {
    const box = (await line.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(220);
    const stepper = (await line.locator('.qty').boundingBox())!;
    const remove = (await line.locator('[data-line-remove]').boundingBox())!;
    expect(Math.abs(stepper.y + stepper.height / 2 - (remove.y + remove.height / 2))).toBeLessThan(
      4,
    );
    expect(remove.x).toBeGreaterThan(stepper.x + stepper.width);
  }
});
