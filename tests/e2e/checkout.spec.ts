// Spec 8: add two products from the shop, change a quantity in the drawer,
// open the cart page, go to checkout (Point Relais preselected with its price
// in the total, review 11), pick pickup, accept the terms, pay with
// /api/checkout mocked, check the request body and the thanks page. Runs in
// both locales; the "mobile" project repeats everything at 390 px.
import { expect, test, type Page } from '@playwright/test';
import {
  PATHS,
  SESSION_ID,
  blockThirdParties,
  formatInPage,
  json,
  orderFixture,
  readCatalog,
  relayShipping,
  wholePrice,
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

    // Checkout: Point Relais is preselected, so the summary shows its price
    // and a complete total before any click.
    await page.locator('[data-cart-page-checkout]').click();
    await expect(page).toHaveURL(new RegExp(`${paths.checkout}$`));
    await expect(page.locator('[data-co-lines] li[data-sku]')).toHaveCount(2);
    await expect(page.locator('input[name="delivery-method"][value="relay"]')).toBeChecked();
    await expect(page.locator('[data-method-detail="relay"]')).toBeVisible();
    await expect(page.locator('[data-relay-frame]')).toBeHidden();
    const relayCents = relayShipping(catalog, subtotal);
    await expect(page.locator('[data-co-shipping]')).toHaveText(
      relayCents === 0 ? copy.free : await formatInPage(page, relayCents, locale),
    );
    await expect(page.locator('[data-co-total]')).toHaveText(
      await formatInPage(page, subtotal + relayCents, locale),
    );

    // Then pickup, one tap away.
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
    await expect(page.locator('h1')).toHaveText(
      locale === 'fr' ? 'Merci pour votre commande' : 'Thank you for your order',
    );
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

  // Relay preselected, no point yet: the payment is refused on the client.
  await expect(page.locator('input[name="delivery-method"][value="relay"]')).toBeChecked();
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

  // No point chosen and no search yet: the message sits under the search row
  // in its alert, the focus on the postcode, which is not marked invalid
  // (review 14), and nothing appears below the delivery cards.
  await page.locator('[data-co-terms]').check();
  await page.locator('[data-co-pay]').click();
  const choose = page.locator('#rep-relay-error');
  await expect(choose).toHaveText('Choisissez un Point Relais.');
  await expect(choose).toHaveAttribute('role', 'alert');
  await expect(postcodeError).toHaveText('');
  await expect(postcode).toBeFocused();
  await expect(postcode).not.toHaveAttribute('aria-invalid', 'true');
  expect(
    await choose.evaluate(
      (el) => el.previousElementSibling?.classList.contains('relay-fields') ?? false,
    ),
  ).toBe(true);
  await expect(page.locator('[data-co-delivery-error]')).toBeHidden();

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
  // No order: the heading does not thank for one (review 13).
  await page.goto(PATHS.en.thanks);
  await expect(page.locator('h1')).toHaveText('Thank you for visiting');
  await expect(page.locator('[data-thanks-lead]')).toContainText('Placed an order?');
  await expect(page.locator('[data-thanks-order]')).toBeHidden();
  await page.goto(PATHS.fr.thanks);
  await expect(page.locator('h1')).toHaveText('Merci de votre visite');
  await expect(page.locator('h1')).not.toContainText('commande');

  await page.route('**/api/orders/**', (route) =>
    json(route, 404, { error: { code: 'NOT_FOUND', message: 'x' } }),
  );
  await page.goto(`${PATHS.fr.thanks}?session_id=${SESSION_ID}`);
  await expect(page.locator('[data-thanks]')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('h1')).toHaveText('Merci de votre visite');
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
  [
    'FORBIDDEN_ORIGIN',
    403,
    /Le paiement n’a pas pu démarrer\..*appelez‑nous au 07 75 68 91 08.*panier est conservé/,
  ],
  ['PAYMENT_PROVIDER_ERROR', 502, /appelez‑nous au 07 75 68 91 08/],
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

for (const locale of ['fr', 'en'] as const satisfies readonly Locale[]) {
  test(`cart page: delivery line from the settings, "Commander" in the first screen (${locale})`, async ({
    page,
  }) => {
    const paths = PATHS[locale];
    await page.goto(paths.shop);
    const catalog = await readCatalog(page);
    const add = page.locator('button[data-add-to-cart]:not([disabled])').first();
    const sku = (await add.getAttribute('data-sku'))!;
    await add.click();
    await page.keyboard.press('Escape');

    const unit = catalog.products[sku]!.unitAmount;
    const relay = catalog.shipping.find((s) => s.id === 'relay')!.amount;
    const threshold = catalog.freeShippingFrom!;
    const amount = await formatInPage(page, relay, locale);
    const free = wholePrice(await formatInPage(page, threshold, locale));
    const hint =
      locale === 'fr'
        ? `Dès ${amount} en Point Relais, offerte dès ${free}`
        : `From ${amount} to a pickup point, free from ${free}`;
    expect(unit).toBeLessThan(threshold);

    // The drawer says it too.
    await page.locator('[data-cart-toggle]').first().click();
    await expect(page.locator('[data-drawer-shipping]')).toHaveText(hint);
    await page.keyboard.press('Escape');

    await page.goto(paths.cart);
    await expect(page.locator('[data-cart-page-shipping]')).toHaveText(hint);
    // One line: the primary action is on the first screen, phone included,
    // and the phone bar stays away.
    await expect(page.locator('[data-cart-page-checkout]')).toBeInViewport();
    await expect(page.locator('[data-cart-bar]')).toBeHidden();

    // Past the threshold the line says free.
    const needed = Math.ceil(threshold / unit);
    if (needed <= catalog.maxQuantityPerLine) {
      const qty = page.locator('[data-cart-page-lines] [data-line-qty]').first();
      await qty.fill(String(needed));
      await qty.press('Enter');
      await expect(page.locator('[data-cart-page-shipping]')).toHaveText(
        locale === 'fr' ? 'Offerte' : 'Free',
      );
    }
  });
}

test('cart cross-sell never offers another format of a product in the cart', async ({ page }) => {
  await page.goto(PATHS.fr.shop);
  const catalog = await readCatalog(page);
  // A product sold in two formats (moringa 100 g and 200 g, for example).
  const family = (p: { slug: string; category: string }) =>
    `${p.category}/${p.slug.replace(/-\d+(?:[.,]\d+)?k?g$/i, '')}`;
  const skus = Object.keys(catalog.products);
  const sku = skus.find(
    (a) =>
      catalog.products[a]!.stock !== 'out' &&
      skus.some((b) => b !== a && family(catalog.products[b]!) === family(catalog.products[a]!)),
  );
  test.skip(!sku, 'no product in two formats');
  await page.evaluate(
    (line) =>
      localStorage.setItem(
        'rep.cart.v1',
        JSON.stringify({ version: 1, lines: [line], updatedAt: new Date().toISOString() }),
      ),
    { sku: sku!, quantity: 1 },
  );
  await page.goto(PATHS.fr.cart);
  const items = page.locator('[data-cross-sell] [data-cross-sell-sku]');
  await expect(items.first()).toBeVisible();
  for (const other of await items.evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.crossSellSku!),
  ))
    expect(family(catalog.products[other]!)).not.toBe(family(catalog.products[sku!]!));
});

/**
 * A stand-in for the Mondial Relay plugin (the real one is remote): the
 * markup shapes of widget 4.0.11, a closed point first ("En vacances" in the
 * search results), then an open one. FocusOnMap selects the open point.
 */
const FAKE_PLUGIN = `(function ($) {
  var closed = { Pays: 'FR', ID: '016741', Available: false,
    Warning: '<div class="PR-Warning">En vacances jusqu\\'au 11/11/2026</div>' };
  var open = { Pays: 'FR', ID: '036408', Available: true, Nom: 'LOCKER SECURISTEST',
    Adresse1: '47 BOULEVARD DE LA MUETTE', Adresse2: '', CP: '95140',
    Ville: 'GARGES LES GONESSE' };
  var item = function (p, i, name) {
    return "<div class='PR-List-Item " + (p.Available ? '' : 'PR-Disabled') +
      "' onclick='MR_jQuery(\\"#rep-relay-widget\\").trigger(\\"FocusOnMap\\"," + i + ")'>" +
      "<input type='hidden' class='PR-Id' value='" + p.Pays + '-' + p.ID + "'/>" +
      "<div class='PR-Name'>" + (i + 1) + ' - ' + name + '</div><div>34 AVENUE PAUL</div>' +
      '<div></div><div>95400 - ARNOUVILLE</div></div>';
  };
  $.fn.MR_ParcelShopPicker = function (opts) {
    var el = this;
    var render = function () {
      opts.OnSearchSuccess({ PRList: [closed, open] });
      el.html('<div class="MR-Widget"><div class="MRW-Content"><div class="MRW-Results">' +
        '<div class="MRW-RList">' + item(closed, 0, 'LOCKER 24/7 LIDL ARNOUVILLE') +
        item(open, 1, 'LOCKER SECURISTEST') + '</div><div class="MRW-Map"></div></div>' +
        '<div style="color: red">Attention : compte de démonstration</div></div></div>');
    };
    el.data('plugin_MR_ParcelShopPicker', true);
    el.on('MR_DoSearch', render);
    el.on('FocusOnMap', function (e, i) { if (i === 1) opts.OnParcelShopSelected(open); });
    render();
    return this;
  };
})(jQuery);`;

const PLUGIN =
  'https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js';

async function seedCheckout(page: Page, lines: Array<{ sku: string; quantity: number }>) {
  await page.goto('/');
  await page.evaluate(
    (l) =>
      localStorage.setItem(
        'rep.cart.v1',
        JSON.stringify({ version: 1, lines: l, updatedAt: new Date().toISOString() }),
      ),
    lines,
  );
  await page.goto(PATHS.fr.checkout);
}

test('relay list: closed point last with its reason, keyboard choice, no Google Fonts (review 13)', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.route(PLUGIN, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_PLUGIN }),
  );
  await seedCheckout(page, [{ sku: 'REP-MOR-100', quantity: 1 }]);
  const fallback = page.locator('[data-relay-fallback]');
  await expect(fallback).toBeHidden();
  await page.locator('[data-relay-postcode]').fill('95400');
  await page.locator('[data-relay-go]').click();

  const items = page.locator('#rep-relay-widget .PR-List-Item');
  await expect(items).toHaveCount(2);
  // Sentence case without the list number, the closed point moved last.
  await expect(items.first().locator('.PR-Name')).toHaveText('Locker Securistest');
  await expect(items.first()).toContainText('95400 Arnouville');
  const closed = items.last();
  await expect(closed).toHaveClass(/PR-Disabled/);
  await expect(closed).toHaveAttribute('aria-disabled', 'true');
  await expect(closed.locator('.rep-relay-closed')).toHaveText(
    'Fermé jusqu’au 11/11/2026 : choisissez un autre Point Relais.',
  );
  // Picking it selects nothing and says why, next to the list.
  await closed.click({ force: true });
  await expect(page.locator('[data-relay-status]')).toHaveText(/Fermé jusqu’au 11\/11\/2026/);
  await expect(page.locator('[data-relay-chosen]')).toBeHidden();
  // The demonstration notice stays, quieter (not red).
  const notice = page.locator('#rep-relay-widget [style*="color: red"]');
  await expect(notice).toBeVisible();
  expect(await notice.evaluate((el) => getComputedStyle(el).color)).not.toBe('rgb(255, 0, 0)');

  // Keyboard: the open point is a button.
  await items.first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-relay-chosen]')).toBeVisible();
  await expect(page.locator('[data-relay-name]')).toHaveText('Locker Securistest');
  await expect(fallback).toBeHidden();
  expect(requested.filter((url) => /fonts\.(googleapis|gstatic)\.com/.test(url))).toEqual([]);
  // The widget stylesheet is the shop's, from the build.
  expect(requested.some((url) => /\/_astro\/relay-widget\.[\w-]+\.css$/.test(url))).toBe(true);
});

test('relay: "La carte ne s’affiche pas ?" shows only when the widget fails to load', async ({
  page,
}) => {
  // Third parties are blocked (beforeEach): the plugin request fails.
  await seedCheckout(page, [{ sku: 'REP-MOR-100', quantity: 1 }]);
  const fallback = page.locator('[data-relay-fallback]');
  await expect(fallback).toBeHidden();
  await page.locator('[data-relay-postcode]').fill('95400');
  await page.locator('[data-relay-go]').click();
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveClass(/is-alert/);
  await expect(fallback).toContainText('07 75 68 91 08');
});

test('phone checkout: a sticky total and Payer bar while the pay button is below', async ({
  page,
}) => {
  const phone = (page.viewportSize()?.width ?? 1280) < 900;
  await seedCheckout(page, [
    { sku: 'REP-MOR-100', quantity: 2 },
    { sku: 'REP-BAO-100', quantity: 1 },
  ]);
  await page.locator('.method-card', { hasText: 'Retrait' }).click();
  const bar = page.locator('[data-co-bar]');
  if (!phone) {
    await expect(bar).toBeHidden();
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).toHaveClass(/is-visible/);
  await expect(bar.locator('[data-co-bar-total]')).toHaveText(
    (await page.locator('[data-co-total]').textContent())!,
  );

  // Terms not ticked: the bar takes the customer to them, with the message.
  await bar.locator('[data-co-bar-pay]').click();
  await expect(page.locator('[data-co-terms-error]')).toBeVisible();
  await expect(page.locator('[data-co-terms]')).toBeFocused();
  await expect(page.locator('[data-co-terms]')).toBeInViewport();

  // Ticked: the bar pays (the API fails here, the basket stays).
  await page.locator('[data-co-terms]').check();
  let calls = 0;
  await page.route('**/api/checkout', (route) => {
    calls += 1;
    return json(route, 403, { error: { code: 'FORBIDDEN_ORIGIN', message: 'x' } });
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).toHaveClass(/is-visible/);
  await bar.locator('[data-co-bar-pay]').click();
  await expect(page.locator('[data-co-error]')).toContainText('votre panier est conservé');
  expect(calls).toBe(1);
  // Once the pay button is on screen, the bar steps aside.
  await page.locator('[data-co-pay]').scrollIntoViewIfNeeded();
  await expect(bar).not.toHaveClass(/is-visible/);
});

test('relay: "Payer" before a choice points at the list, never at the valid postcode (B2)', async ({
  page,
}) => {
  // No smooth scrolling: the boxes are measured once the page has moved.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(PLUGIN, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_PLUGIN }),
  );
  await seedCheckout(page, [{ sku: 'REP-MOR-100', quantity: 1 }]);
  const postcode = page.locator('[data-relay-postcode]');
  await postcode.fill('95400');
  await page.locator('[data-relay-go]').click();
  const items = page.locator('#rep-relay-widget .PR-List-Item');
  await expect(items).toHaveCount(2);

  // Labels on one baseline, controls on one row, before and after the message.
  const row = async () => {
    const boxes = await Promise.all(
      ['label[for="rep-relay-postcode"]', 'label[for="rep-relay-country"]'].map(
        async (sel) => (await page.locator(sel).boundingBox())!,
      ),
    );
    const controls = await Promise.all(
      ['#rep-relay-postcode', '#rep-relay-country'].map(
        async (sel) => (await page.locator(sel).boundingBox())!,
      ),
    );
    return { labels: boxes.map((b) => Math.round(b.y)), controls: controls.map((b) => b.y) };
  };
  const before = await row();
  expect(before.labels[0]).toBe(before.labels[1]);
  expect(Math.abs(before.controls[0]! - before.controls[1]!)).toBeLessThan(1);

  await page.locator('[data-co-terms]').check();
  await page.locator('[data-co-pay]').click();
  const choose = page.locator('#rep-relay-error');
  await expect(choose).toHaveText('Choisissez un Point Relais.');
  // Under the results list, the focus on the first open point, which it describes.
  expect(
    await choose.evaluate(
      (el) => el.previousElementSibling?.hasAttribute('data-relay-frame') ?? false,
    ),
  ).toBe(true);
  const first = items.first();
  await expect(first).toBeFocused();
  await expect(first).not.toHaveClass(/PR-Disabled/);
  await expect(first).toHaveAttribute('aria-describedby', 'rep-relay-error');
  await expect(postcode).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#rep-relay-postcode-error')).toHaveText('');
  // The page scrolled to the list: same row, same label-to-control distance.
  const after = await row();
  expect(after.labels[0]).toBe(after.labels[1]);
  expect(Math.abs(after.controls[0]! - after.controls[1]!)).toBeLessThan(1);
  expect(
    Math.abs(after.controls[0]! - after.labels[0]! - (before.controls[0]! - before.labels[0]!)),
  ).toBeLessThan(1);

  // Choosing the point clears the message.
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-relay-chosen]')).toBeVisible();
  await expect(choose).toHaveText('');
});

test('relay map: the widget stays in its own layer under the phone pay bar (B3)', async ({
  page,
}) => {
  await page.route(PLUGIN, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_PLUGIN }),
  );
  await seedCheckout(page, [{ sku: 'REP-MOR-100', quantity: 1 }]);
  await page.locator('[data-relay-postcode]').fill('95400');
  await page.locator('[data-relay-go]').click();
  const frame = page.locator('[data-relay-frame]');
  await expect(frame.locator('.PR-List-Item')).toHaveCount(2);
  const style = await frame.evaluate((el) => {
    const css = getComputedStyle(el);
    return { isolation: css.isolation, overflow: css.overflow, zIndex: css.zIndex };
  });
  expect(style).toEqual({ isolation: 'isolate', overflow: 'hidden', zIndex: '0' });

  // A Leaflet-like popup (z-index 700, taller than the map) never paints over
  // the bar, nor outside the frame.
  await frame.locator('.MRW-Map').evaluate((map) => {
    (map as HTMLElement).style.position = 'relative';
    const popup = document.createElement('div');
    popup.id = 'fake-popup';
    popup.style.cssText =
      'position:absolute;left:0;top:0;width:100%;height:2000px;z-index:700;background:red';
    map.append(popup);
  });
  const bar = page.locator('[data-co-bar]');
  if ((page.viewportSize()?.width ?? 1280) >= 900) return;
  await frame.evaluate((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + 60 - window.innerHeight + 40);
  });
  await expect(bar).toHaveClass(/is-visible/);
  const hit = await bar.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const node = document.elementFromPoint(box.left + 20, box.top + box.height / 2);
    return node ? el.contains(node) || node === el : false;
  });
  expect(hit).toBe(true);
});

test('checkout summary: the quantity reads "×2" in a small kraft tag, none for one unit', async ({
  page,
}) => {
  await seedCheckout(page, [
    { sku: 'REP-MOR-100', quantity: 2 },
    { sku: 'REP-BAO-100', quantity: 1 },
  ]);
  const two = page.locator('[data-co-lines] li[data-sku="REP-MOR-100"] [data-line-badge]');
  const one = page.locator('[data-co-lines] li[data-sku="REP-BAO-100"] [data-line-badge]');
  await expect(two).toHaveText('×2');
  await expect(one).toBeHidden();
  const [badge, step] = await Promise.all([
    two.evaluate((el) => {
      const css = getComputedStyle(el);
      return { radius: css.borderTopLeftRadius, height: el.getBoundingClientRect().height };
    }),
    page
      .locator('.co-step')
      .first()
      .evaluate((el) => {
        const css = getComputedStyle(el);
        return { radius: css.borderTopLeftRadius, height: el.getBoundingClientRect().height };
      }),
  ]);
  expect(badge.radius).not.toBe(step.radius);
  expect(badge.height).toBeLessThan(step.height * 0.7);
});
