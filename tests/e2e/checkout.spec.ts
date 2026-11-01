// Spec 8: add two products from the shop, change a quantity in the drawer,
// open the cart page, go to checkout, pick pickup, accept the terms, pay with
// /api/checkout mocked, check the request body and the thanks page. Runs in
// both locales; the "mobile" project repeats everything at 390 px.
import { expect, test } from '@playwright/test';
import {
  PATHS,
  SESSION_ID,
  blockThirdParties,
  formatInPage,
  json,
  orderFixture,
  readCatalog,
  type Locale,
} from './helpers';

const COPY = {
  fr: { pickup: /Retrait/, viewCart: 'Voir le panier', checkout: 'Commander', free: 'Offerte' },
  en: {
    pickup: /pickup in Arnouville/i,
    viewCart: 'View basket',
    checkout: 'Checkout',
    free: 'Free',
  },
} as const;

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

for (const locale of ['fr', 'en'] as const satisfies readonly Locale[]) {
  test(`purchase flow with pickup (${locale})`, async ({ page }) => {
    const paths = PATHS[locale];
    const copy = COPY[locale];
    await page.goto(paths.shop);
    const catalog = await readCatalog(page);

    const adds = page.locator('button[data-add-to-cart]:not([disabled])');
    const first = (await adds.nth(0).getAttribute('data-sku'))!;
    const second = (await adds.nth(1).getAttribute('data-sku'))!;
    const drawer = page.locator('#cart-drawer');

    // First product: the drawer opens and the live region names the product.
    await adds.nth(0).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-cart-live]')).toContainText(catalog.products[first]!.name);
    await expect(page.locator('[data-cart-toggle]')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    // Second product.
    await adds.nth(1).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('li[data-sku]')).toHaveCount(2);

    // Change a quantity in the drawer.
    const firstLine = drawer.locator(`li[data-sku="${first}"]`);
    await firstLine.locator('[data-line-step="1"]').click();
    await expect(firstLine.locator('[data-line-qty]')).toHaveValue('2');
    await expect(page.locator('[data-cart-count]').first()).toHaveText('3');
    const subtotal = 2 * catalog.products[first]!.unitAmount + catalog.products[second]!.unitAmount;
    await expect(drawer.locator('[data-drawer-subtotal]')).toHaveText(
      await formatInPage(page, subtotal, locale),
    );

    // Cart page.
    await drawer.getByRole('link', { name: copy.viewCart }).click();
    await expect(page).toHaveURL(new RegExp(`${paths.cart}$`));
    const lines = page.locator('[data-cart-page-lines] li[data-sku]');
    await expect(lines).toHaveCount(2);
    await expect(lines.first().locator('[data-line-qty]')).toHaveValue('2');
    await expect(page.locator('[data-cart-page-subtotal]')).toHaveText(
      await formatInPage(page, subtotal, locale),
    );

    // Checkout with pickup.
    await page.locator('[data-cart-page-checkout]').click();
    await expect(page).toHaveURL(new RegExp(`${paths.checkout}$`));
    await expect(page.locator('[data-co-lines] li[data-sku]')).toHaveCount(2);
    await page.locator('.method-card', { hasText: copy.pickup }).click();
    await expect(page.locator('[data-method-detail="pickup"]')).toBeVisible();
    await expect(page.locator('[data-method-detail="pickup"]')).toContainText('9 Rue du Marché');
    await expect(page.locator('[data-co-shipping]')).toHaveText(copy.free);

    // The terms are required.
    const pay = page.locator('[data-co-pay]');
    await pay.click();
    await expect(page.locator('[data-co-terms-error]')).toBeVisible();
    await page.locator('[data-co-terms]').check();

    let body: unknown = null;
    await page.route('**/api/checkout', async (route) => {
      body = route.request().postDataJSON();
      await json(route, 200, { url: `${paths.thanks}?session_id=${SESSION_ID}` });
    });
    const order = orderFixture([
      {
        name: catalog.products[first]!.name,
        quantity: 2,
        unitAmount: catalog.products[first]!.unitAmount,
      },
      {
        name: catalog.products[second]!.name,
        quantity: 1,
        unitAmount: catalog.products[second]!.unitAmount,
      },
    ]);
    await page.route(`**/api/orders/${SESSION_ID}`, (route) => json(route, 200, order));

    await pay.click();
    await page.waitForURL(`**${paths.thanks}?session_id=${SESSION_ID}`);
    expect(body).toEqual({
      locale,
      items: [
        { sku: first, quantity: 2, unitAmount: catalog.products[first]!.unitAmount },
        { sku: second, quantity: 1, unitAmount: catalog.products[second]!.unitAmount },
      ],
      delivery: { method: 'pickup' },
      acceptedTerms: true,
    });

    // Thanks: the mocked order, and the cart is cleared because it is paid.
    await expect(page.locator('[data-thanks-number]')).toContainText('RP-2026-0042');
    await expect(page.locator('[data-thanks-lines] li')).toHaveCount(2);
    await expect(page.locator('[data-thanks-total]')).toHaveText(
      await formatInPage(page, subtotal, locale),
    );
    await expect(page.locator('[data-thanks-pickup]')).toBeVisible();
    await expect(page.locator('[data-thanks-discount-row]')).toBeHidden();
    await expect(page.locator('[data-cart-count]').first()).toHaveText('0');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rep.cart.v1')!));
    expect(stored.lines).toEqual([]);
  });
}

test('relay without a chosen point, then an out-of-stock answer from the API', async ({ page }) => {
  await page.goto(PATHS.fr.shop);
  const adds = page.locator('button[data-add-to-cart]:not([disabled])');
  const sku = (await adds.nth(0).getAttribute('data-sku'))!;
  await adds.nth(0).click();
  await page.keyboard.press('Escape');
  await page.goto(PATHS.fr.checkout);

  // Relay selected, no point yet: the payment is refused on the client.
  await page.locator('.method-card', { hasText: 'Point Relais' }).click();
  await expect(page.locator('[data-relay-search]')).toBeVisible();

  // Empty, then malformed postcode: a visible error tied to the field, no widget load.
  const postcode = page.locator('[data-relay-postcode]');
  const postcodeError = page.locator('#rep-relay-postcode-error');
  await expect(postcode).toHaveAttribute('aria-describedby', 'rep-relay-postcode-error');
  await expect(postcodeError).toHaveAttribute('aria-live', 'polite');
  await page.locator('[data-relay-go]').click();
  await expect(postcodeError).toHaveText(/Saisissez un code postal/);
  await expect(postcode).toHaveAttribute('aria-invalid', 'true');
  await expect(postcode).toBeFocused();
  await postcode.fill('9!');
  await expect(postcodeError).toHaveText('');
  await postcode.press('Enter');
  await expect(postcodeError).toHaveText(/n’est pas valide/);
  await expect(page.locator('[data-relay-frame]')).toBeHidden();
  await postcode.fill('');
  await expect(postcode).not.toHaveAttribute('aria-invalid', 'true');

  await page.locator('[data-co-terms]').check();
  await page.locator('[data-co-pay]').click();
  await expect(page.locator('[data-co-delivery-error]')).toHaveText(/point relais/i);

  // Home delivery, the API answers OUT_OF_STOCK: the line is flagged with a remove action.
  await page.locator('.method-card', { hasText: 'domicile' }).click();
  await page.route('**/api/checkout', (route) =>
    json(route, 409, {
      error: { code: 'OUT_OF_STOCK', message: 'out', details: { skus: [sku] } },
    }),
  );
  await page.locator('[data-co-pay]').click();
  const line = page.locator(`[data-co-lines] li[data-sku="${sku}"]`);
  await expect(page.locator('[data-co-error]')).toBeVisible();
  await expect(line).toHaveClass(/is-flagged/);
  await expect(page.locator('[data-co-pay]')).toBeEnabled();
  await line.locator('[data-line-remove]').click();
  await expect(page.locator('[data-checkout-empty]')).toBeVisible();
});

test('thanks page stays neutral without a session or when the order lookup fails', async ({
  page,
}) => {
  await page.goto(PATHS.en.thanks);
  await expect(page.locator('[data-thanks-lead]')).toContainText('Thank you for visiting');
  await expect(page.locator('[data-thanks-order]')).toBeHidden();

  await page.route('**/api/orders/**', (route) =>
    json(route, 404, { error: { code: 'NOT_FOUND', message: 'x' } }),
  );
  await page.goto(`${PATHS.fr.thanks}?session_id=${SESSION_ID}`);
  await expect(page.locator('[data-thanks]')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-thanks-lead]')).toContainText('Merci de votre visite');
  await expect(page.locator('[data-thanks-order]')).toBeHidden();
});

test('a revisit of the thanks page never empties a cart filled since', async ({ page }) => {
  const order = orderFixture([{ name: 'Poudre de moringa 100 g', quantity: 1, unitAmount: 890 }]);
  await page.route(`**/api/orders/${SESSION_ID}`, (route) => json(route, 200, order));
  await page.goto(PATHS.fr.shop);
  await page.locator('button[data-add-to-cart]:not([disabled])').first().click();
  await page.goto(`${PATHS.fr.thanks}?session_id=${SESSION_ID}`);
  await expect(page.locator('[data-thanks-order]')).toBeVisible();
  await expect(page.locator('[data-cart-count]').first()).toHaveText('0');

  // A new cart, then the same thanks link again (history, reload).
  await page.goto(PATHS.fr.shop);
  await page.locator('button[data-add-to-cart]:not([disabled])').first().click();
  await page.goto(`${PATHS.fr.thanks}?session_id=${SESSION_ID}`);
  await expect(page.locator('[data-thanks-order]')).toBeVisible();
  await expect(page.locator('[data-cart-count]').first()).toHaveText('1');
});

test('thanks page retries a failing lookup, then says the order cannot be shown', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/orders/**', (route) => {
    calls += 1;
    return json(route, 502, { error: { code: 'PAYMENT_PROVIDER_ERROR', message: 'x' } });
  });
  await page.goto(`${PATHS.fr.thanks}?session_id=${SESSION_ID}`);
  await expect(page.locator('[data-thanks-lead]')).toContainText('confirmation', {
    timeout: 15_000,
  });
  await expect(page.locator('[data-thanks]')).not.toHaveAttribute('aria-busy', 'true');
  expect(calls).toBe(3);
  await expect(page.locator('[data-thanks-order]')).toBeHidden();
});

for (const [code, status, text] of [
  ['PRICE_CHANGED', 409, /prix a changé/],
  ['RATE_LIMITED', 429, /Patientez une minute/],
  ['CATALOG_UNAVAILABLE', 503, /momentanément indisponible/],
  ['FORBIDDEN_ORIGIN', 403, /Une erreur est survenue/],
] as const) {
  test(`checkout shows a message for ${code} and the button works again`, async ({ page }) => {
    await page.goto(PATHS.fr.shop);
    await page.locator('button[data-add-to-cart]:not([disabled])').first().click();
    await page.goto(PATHS.fr.checkout);
    await page.locator('.method-card', { hasText: 'Retrait' }).click();
    await page.locator('[data-co-terms]').check();
    await page.route('**/api/checkout', (route) =>
      json(route, status, { error: { code, message: 'x' } }),
    );
    await page.locator('[data-co-pay]').click();
    await expect(page.locator('[data-co-error]')).toHaveText(text);
    await expect(page.locator('[data-co-pay]')).toBeEnabled();
  });
}

test('thanks page shows the promotion code discount', async ({ page }) => {
  const order = {
    ...orderFixture([{ name: 'Poudre de moringa 100 g', quantity: 2, unitAmount: 890 }]),
    amounts: { subtotal: 1780, shipping: 490, discount: 500, total: 1770, currency: 'eur' },
  };
  await page.route(`**/api/orders/${SESSION_ID}`, (route) => json(route, 200, order));
  for (const locale of ['fr', 'en'] as const) {
    await page.goto(`${PATHS[locale].thanks}?session_id=${SESSION_ID}`);
    const row = page.locator('[data-thanks-discount-row]');
    await expect(row).toBeVisible();
    await expect(row.locator('dt')).toHaveText(locale === 'fr' ? 'Remise' : 'Discount');
    await expect(row.locator('[data-thanks-discount]')).toHaveText(
      `−${await formatInPage(page, 500, locale)}`,
    );
    await expect(page.locator('[data-thanks-total]')).toHaveText(
      await formatInPage(page, 1770, locale),
    );
  }
});

test('drawer keeps the focus inside and returns it to the opener', async ({ page }) => {
  await page.goto(PATHS.fr.shop);
  const add = page.locator('button[data-add-to-cart]:not([disabled])').first();
  await add.click();
  const drawer = page.locator('#cart-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-drawer-title]')).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () =>
        !!document.activeElement?.closest('#cart-drawer') ||
        document.activeElement === document.body,
    );
    expect(inside).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(add).toBeFocused();

  // Backdrop click closes it too.
  await page.locator('[data-cart-toggle]').click();
  await expect(drawer).toBeVisible();
  await page.mouse.click(5, 400);
  await expect(drawer).toBeHidden();
});
