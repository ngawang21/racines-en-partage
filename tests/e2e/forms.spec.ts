// Iteration 3, forms and cart: contact, newsletter (footer and landing page),
// stock alert, order lookup, review page, cart cross-sell and the header
// search dialog, with /api/* mocked per test. Runs at both viewports.
import { expect, test, type Page, type Request } from '@playwright/test';
import { PATHS, blockThirdParties, json, orderFixture, readCatalog } from './helpers';

const CONTACT = { fr: '/contact/', en: '/en/contact/' } as const;
const LOOKUP = { fr: '/ma-commande/', en: '/en/my-order/' } as const;
const REVIEW = { fr: '/avis/', en: '/en/review/' } as const;
const NEWSLETTER = { fr: '/newsletter/', en: '/en/newsletter/' } as const;

test.beforeEach(async ({ page }) => {
  await blockThirdParties(page);
});

/** Records the JSON body of every call to `path`, answering with `status` and `body`. */
async function mockApi(page: Page, path: string, status: number, body: unknown) {
  const calls: unknown[] = [];
  await page.route(`**${path}`, (route) => {
    calls.push((route.request() as Request).postDataJSON());
    return json(route, status, body);
  });
  return calls;
}

/** "payload.signature" with a base64url JSON payload, as the Worker builds it (any signature). */
function reviewToken(payload: Record<string, unknown>): string {
  return `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2lnbmF0dXJl`;
}

test.describe('contact form', () => {
  test('validates inline, then sends the message and shows the confirmation', async ({ page }) => {
    const calls = await mockApi(page, '/api/contact', 202, { ok: true });
    await page.goto(CONTACT.fr);
    const form = page.locator('form[data-form="contact"]');

    // Empty submit: errors tied to the fields, the focus on the first one, no request.
    await form.getByRole('button', { name: 'Envoyer le message' }).click();
    const name = form.getByLabel('Votre nom');
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#contact-name-error')).toHaveText('Ce champ est obligatoire.');
    await expect(page.locator('#contact-email-error')).not.toBeEmpty();
    expect(calls).toHaveLength(0);

    // A bad address keeps its own message; fixing a field clears its error.
    await name.fill('Awa');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await form.getByLabel(/Votre e.mail/).fill('awa@exemple');
    await form.getByLabel('Votre message').fill('Bonjour, livrez-vous en Belgique ?');
    await form.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.locator('#contact-email-error')).toContainText(/adresse e.mail complète/);
    await expect(form.getByLabel(/Votre e.mail/)).toBeFocused();

    await form.getByLabel(/Votre e.mail/).fill('awa@exemple.fr');
    await form.getByRole('button', { name: 'Envoyer le message' }).click();
    const done = form.locator('[data-form-done]');
    await expect(done).toBeVisible();
    await expect(done).toBeFocused();
    await expect(done).toContainText('votre message est bien parti');
    await expect(form.locator('[data-form-fields]')).toBeHidden();
    expect(calls).toEqual([
      {
        kind: 'contact',
        locale: 'fr',
        name: 'Awa',
        email: 'awa@exemple.fr',
        message: 'Bonjour, livrez-vous en Belgique ?',
        website: '',
      },
    ]);
  });

  for (const [code, status, text] of [
    ['RATE_LIMITED', 429, /Patientez une minute/],
    ['CAPTCHA_FAILED', 400, /vérification anti-robot/],
    ['MAIL_FAILED', 502, /envoi n’a pas abouti/],
    ['VALIDATION_ERROR', 400, /Certains champs sont à vérifier/],
    ['FEATURE_DISABLED', 404, /momentanément fermé/],
  ] as const) {
    test(`shows the message for ${code} and lets the customer retry`, async ({ page }) => {
      await mockApi(page, '/api/contact', status, { error: { code, message: 'x' } });
      await page.goto(CONTACT.fr);
      const form = page.locator('form[data-form="contact"]');
      await form.getByLabel('Votre nom').fill('Awa');
      await form.getByLabel(/Votre e.mail/).fill('awa@exemple.fr');
      await form.getByLabel('Votre message').fill('Une question sur le moringa.');
      await form.locator('[data-form-submit]').click();
      await expect(form.locator('[data-form-status]')).toHaveText(text);
      await expect(form.locator('[data-form-submit]')).not.toHaveAttribute('aria-disabled', 'true');
      await expect(form.locator('[data-form-fields]')).toBeVisible();
    });
  }

  test('says so when the network fails (English)', async ({ page }) => {
    await page.route('**/api/contact', (route) => route.abort());
    await page.goto(CONTACT.en);
    const form = page.locator('form[data-form="contact"]');
    await form.getByLabel('Your name').fill('Sam');
    await form.getByLabel('Your e-mail').fill('sam@example.com');
    await form.getByLabel('Your message').fill('Do you ship to Ireland?');
    await form.getByRole('button', { name: 'Send the message' }).click();
    await expect(form.locator('[data-form-status]')).toHaveText(/could not connect/);
  });
});

test.describe('newsletter', () => {
  test('footer signup posts the address and asks to confirm by e-mail', async ({ page }) => {
    const calls = await mockApi(page, '/api/newsletter', 202, { ok: true });
    await page.goto('/en/');
    const form = page.locator('.site-footer form[data-form="newsletter"]');
    await form.getByLabel('Your e-mail').fill('sam@example.com');
    await form.getByRole('button', { name: 'Sign me up' }).click();
    await expect(form.locator('[data-form-done]')).toContainText('Check your inbox');
    await expect(form.locator('[data-form-done]')).toBeFocused();
    expect(calls).toEqual([{ email: 'sam@example.com', locale: 'en' }]);
  });

  test('landing page shows the message of each status', async ({ page }) => {
    const band = page.locator('.nl-band');
    await page.goto(`${NEWSLETTER.fr}?status=ok`);
    await expect(page.locator('[data-landing-when="ok"]')).toBeVisible();
    await expect(page.locator('[data-landing-when="ok"]')).toContainText('Inscription confirmée');
    await expect(page.locator('[data-landing-when="invalid"]')).toBeHidden();
    await expect(band).toBeHidden();

    await page.goto(`${NEWSLETTER.fr}?status=invalid`);
    await expect(page.locator('[data-landing-when="invalid"]')).toContainText('ne fonctionne plus');
    await expect(page.locator('[data-landing-when="ok"]')).toBeHidden();
    await expect(band).toBeVisible();

    await page.goto(NEWSLETTER.en);
    await expect(page.locator('.lead[data-landing-when="none"]')).toBeVisible();
    await expect(page.locator('[data-landing-when="ok"]')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Discover the shop' })).toBeVisible();
  });
});

test('stock alert on an out-of-stock product', async ({ page }) => {
  await page.goto(PATHS.fr.shop);
  const catalog = await readCatalog(page);
  const out = Object.values(catalog.products).find((p) => p.stock === 'out') as
    { url?: string; sku?: string } | undefined;
  // The seed catalogue has every product in stock today; the build test checks
  // the form markup as soon as one is marked "out".
  test.skip(!out, 'no out-of-stock product in the content');
  const calls = await mockApi(page, '/api/contact', 202, { ok: true });
  await page.goto(out!.url!);
  const form = page.locator('form[data-form="stock_alert"]');
  await form.getByRole('textbox').first().fill('awa@exemple.fr');
  await form.locator('[data-form-submit]').click();
  await expect(form.locator('[data-form-done]')).toBeVisible();
  expect(calls).toEqual([
    {
      kind: 'stock_alert',
      locale: 'fr',
      name: '',
      email: 'awa@exemple.fr',
      sku: out!.sku,
      website: '',
    },
  ]);
});

test.describe('order lookup', () => {
  test('finds an order and renders it with the thanks renderer', async ({ page }) => {
    const order = {
      ...orderFixture([{ name: 'Poudre de moringa 100 g', quantity: 2, unitAmount: 890 }]),
      number: 'X9Y8Z7W6',
      delivery: {
        method: 'relay',
        relay: {
          id: 'FR-012345',
          name: 'TABAC DE LA GARE',
          address1: '2 RUE DE LA GARE',
          postcode: '95400',
          city: 'ARNOUVILLE',
          country: 'FR',
        },
      },
    };
    const calls = await mockApi(page, '/api/orders/lookup', 200, order);
    await page.goto(LOOKUP.fr);
    await page.getByLabel('Numéro de commande').fill('x9y8 z7w6');
    await page.getByLabel(/Adresse e.mail/).fill('awa@exemple.fr');
    await page.getByRole('button', { name: 'Retrouver ma commande' }).click();

    const result = page.locator('[data-lookup-result]');
    await expect(result).toBeVisible();
    await expect(result.locator('[data-thanks-number]')).toContainText('X9Y8Z7W6');
    await expect(result.locator('[data-thanks-number]')).toContainText('Payée');
    await expect(result.locator('[data-thanks-number]')).toBeFocused();
    await expect(result.locator('[data-thanks-lines] li')).toHaveCount(1);
    await expect(result.locator('[data-thanks-relay-name]')).toHaveText('Tabac De La Gare');
    await expect(page.locator('[data-lookup-search]')).toBeHidden();
    expect(calls).toEqual([{ number: 'x9y8 z7w6', email: 'awa@exemple.fr' }]);

    // Another lookup: the form comes back with the focus on the number.
    await result.getByRole('button', { name: 'Rechercher une autre commande' }).click();
    await expect(page.getByLabel('Numéro de commande')).toBeFocused();
    await expect(result).toBeHidden();
  });

  test('says when no order matches (404) and keeps the form', async ({ page }) => {
    await mockApi(page, '/api/orders/lookup', 404, {
      error: { code: 'ORDER_NOT_FOUND', message: 'x' },
    });
    await page.goto(LOOKUP.en);
    await page.getByLabel('Order number').fill('ABCDEFGH');
    await page.getByLabel('E-mail address').fill('sam@example.com');
    await page.getByRole('button', { name: 'Find my order' }).click();
    await expect(page.locator('[data-lookup-form] [data-form-status]')).toHaveText(
      /No order matches/,
    );
    await expect(page.locator('[data-lookup-result]')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Find my order' })).toBeVisible();
  });
});

test.describe('review page', () => {
  test('one form per known product, rating required, then the thank-you', async ({ page }) => {
    await page.goto(PATHS.fr.shop);
    const catalog = await readCatalog(page);
    const [first, second] = Object.keys(catalog.products);
    const token = reviewToken({
      s: 'cs_test_123',
      k: [first, 'REP-GONE-100', second],
      l: 'fr',
      e: Math.floor(Date.now() / 1000) + 3600,
    });
    let calls = 0;
    const bodies: unknown[] = [];
    await page.route('**/api/reviews', (route) => {
      calls += 1;
      bodies.push(route.request().postDataJSON());
      return calls === 1
        ? json(route, 201, { ok: true })
        : json(route, 409, { error: { code: 'ALREADY_REVIEWED', message: 'x' } });
    });
    await page.goto(`${REVIEW.fr}?t=${token}`);
    const cards = page.locator('[data-review-list] article');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).getByRole('heading', { level: 2 })).toHaveText(
      catalog.products[first!]!.name,
    );

    const form = cards.nth(0).locator('form');
    await form.getByLabel('Prénom ou pseudonyme').fill('Awa');
    await form
      .getByLabel('Votre avis', { exact: true })
      .fill('Un vrai goût de feuille, parfait dans mes smoothies du matin.');
    await form.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await expect(form.locator('[data-review-stars] .field-error')).toHaveText(
      /Choisissez une note/,
    );
    expect(calls).toBe(0);

    await form.getByText('4 sur 5').click({ force: true });
    await form.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await expect(form.locator('[data-form-done]')).toContainText('sera publié après relecture');
    await expect(form.locator('[data-form-done]')).toBeFocused();
    expect(bodies[0]).toEqual({
      token,
      sku: first,
      rating: 4,
      author: 'Awa',
      text: 'Un vrai goût de feuille, parfait dans mes smoothies du matin.',
      locale: 'fr',
    });

    // The second product was already reviewed for this order.
    const other = cards.nth(1).locator('form');
    await other.getByText('5 sur 5').click({ force: true });
    await other.getByLabel('Prénom ou pseudonyme').fill('Awa');
    await other.getByLabel('Titre (facultatif)').fill('Excellent');
    await other
      .getByLabel('Votre avis', { exact: true })
      .fill('Je recommande vivement, très bonne qualité.');
    await other.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await expect(other.locator('[data-form-done]')).toContainText('déjà donné votre avis');
    expect(bodies[1]).toMatchObject({ sku: second, rating: 5, title: 'Excellent' });
  });

  test('an expired or malformed token shows a message instead of forms', async ({ page }) => {
    const expired = reviewToken({
      s: 'cs_test_123',
      k: ['REP-MOR-100'],
      l: 'fr',
      e: Math.floor(Date.now() / 1000) - 60,
    });
    await page.goto(`${REVIEW.fr}?t=${expired}`);
    await expect(page.locator('[data-review-expired]')).toBeVisible();
    await expect(page.locator('[data-review-list] article')).toHaveCount(0);

    await page.goto(`${REVIEW.en}?t=not-a-token`);
    await expect(page.locator('[data-review-invalid]')).toBeVisible();
    await expect(page.locator('[data-review-invalid]')).toContainText('not valid');
  });
});

test.describe('cart cross-sell', () => {
  test('suggests related products in the drawer, adds one and moves the focus to it', async ({
    page,
  }) => {
    await page.goto(PATHS.fr.shop);
    const catalog = (await readCatalog(page)) as unknown as {
      products: Record<string, { name: string; related: string[]; stock: string }>;
    };
    const sku = Object.keys(catalog.products).find(
      (s) => catalog.products[s]!.related.length > 0 && catalog.products[s]!.stock !== 'out',
    )!;
    await page.locator(`button[data-add-to-cart][data-sku="${sku}"]`).first().click();
    const drawer = page.locator('#cart-drawer');
    await expect(drawer).toBeVisible();
    // The unit price per kilo sits under the unit price.
    await expect(drawer.locator(`li[data-sku="${sku}"] [data-line-kilo]`)).toHaveText(/€\/kg$/);

    const section = drawer.locator('[data-cross-sell]');
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading')).toHaveText('Complétez votre commande');
    const items = section.locator('li[data-cross-sell-sku]');
    await expect(items).not.toHaveCount(0);
    const suggested = await items.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-cross-sell-sku')!),
    );
    expect(suggested.length).toBeLessThanOrEqual(2);
    expect(suggested).not.toContain(sku);
    expect(suggested[0]).toBe(catalog.products[sku]!.related[0]);

    const pick = suggested[0]!;
    await items
      .first()
      .getByRole('button', { name: /^Ajouter .* au panier$/ })
      .click();
    await expect(drawer.locator('[data-drawer-lines] li[data-sku]')).toHaveCount(2);
    await expect(drawer.locator(`li[data-sku="${pick}"] .cart-line-name`)).toBeFocused();
    await expect(section.locator(`li[data-cross-sell-sku="${pick}"]`)).toHaveCount(0);
    await expect(drawer.locator('[data-cart-live]')).toContainText(catalog.products[pick]!.name);
  });

  test('the cart page shows the suggestions and adds without opening the drawer', async ({
    page,
  }) => {
    await page.goto(PATHS.en.shop);
    await page.locator('button[data-add-to-cart]:not([disabled])').first().click();
    await page.keyboard.press('Escape');
    await page.goto(PATHS.en.cart);
    const section = page.locator('[data-cart-page] [data-cross-sell]');
    await expect(section.getByRole('heading', { name: 'Complete your order' })).toBeVisible();
    const pick = await section
      .locator('li[data-cross-sell-sku]')
      .first()
      .getAttribute('data-cross-sell-sku');
    await section.locator('li[data-cross-sell-sku]').first().getByRole('button').click();
    await expect(page.locator('[data-cart-page-lines] li[data-sku]')).toHaveCount(2);
    await expect(
      page.locator(`[data-cart-page-lines] li[data-sku="${pick}"] .cart-line-name`),
    ).toBeFocused();
    await expect(page.locator('#cart-drawer')).toBeHidden();
  });
});

test('header search dialog finds a product by its regional name', async ({ page }) => {
  await page.goto('/');
  const open = page.locator('button[data-search-open]');
  await open.click();
  const dialog = page.locator('dialog#search-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-search-input]')).toBeFocused();
  await dialog.locator('[data-search-input]').fill('bissap');
  await expect(dialog.locator('[data-search-results] li')).toHaveCount(1);
  await expect(dialog.locator('[data-search-results] li')).toContainText(/hibiscus/i);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});
